begin;

create table qarar_minutes.minute_generation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  meeting_id uuid not null references qarar_meetings.meetings(id) on delete restrict,
  requested_by_user_id uuid not null references qarar_iam.users(id) on delete restrict,
  client_request_id uuid,
  status text not null default 'queued' check (status in ('queued','succeeded','failed','expired')),
  context_snapshot jsonb not null,
  provider text,
  model text,
  error_code text,
  output_revision_id uuid references qarar_minutes.minute_revisions(id) on delete restrict,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
  unique (id, organization_id),
  unique (organization_id, requested_by_user_id, client_request_id),
  foreign key (meeting_id, organization_id) references qarar_meetings.meetings(id, organization_id),
  foreign key (requested_by_user_id, organization_id) references qarar_iam.users(id, organization_id)
);
create unique index minute_generation_one_active_request
  on qarar_minutes.minute_generation_requests(meeting_id)
  where status='queued';
create index minute_generation_requests_meeting_idx
  on qarar_minutes.minute_generation_requests(organization_id,meeting_id,requested_at desc);
alter table qarar_minutes.minute_generation_requests enable row level security;
revoke all on qarar_minutes.minute_generation_requests from public,anon,authenticated;
grant select,insert,update,delete on qarar_minutes.minute_generation_requests to qarar_minutes_executor;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values ('minute_generation_requests','minutes',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

create or replace function qarar_minutes.build_minute_generation_context(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_meetings,qarar_attendance,qarar_voting,qarar_decisions,qarar_topics
as $$
declare v_meeting jsonb;
begin
 select to_jsonb(m) into v_meeting from qarar_meetings.meetings m where m.id=p_meeting_id;
 return jsonb_build_object(
   'meeting',v_meeting,
   'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id)
     from qarar_attendance.attendance_records a where a.meeting_id=p_meeting_id),'[]'::jsonb),
   'agenda_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.agenda_order,i.id)
     from qarar_meetings.agenda_items i where i.meeting_id=p_meeting_id),'[]'::jsonb),
   'voting_rounds',coalesce((select jsonb_agg(to_jsonb(v) order by v.opened_at,v.id)
     from qarar_voting.voting_rounds v where v.meeting_id=p_meeting_id),'[]'::jsonb),
   'decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at,d.id)
     from qarar_decisions.decisions d where d.meeting_id=p_meeting_id),'[]'::jsonb)
 );
end;
$$;

create or replace function qarar_minutes.request_minute_generation(
  p_meeting_id uuid,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_iam,qarar_audit
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
  v_meeting qarar_meetings.meetings%rowtype; v_request qarar_minutes.minute_generation_requests%rowtype;
  v_context jsonb;
begin
 select * into v_meeting from qarar_meetings.meetings
 where id=p_meeting_id and organization_id=v_org for share;
 if v_meeting.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform qarar_minutes.assert_minute_access(v_meeting.governance_unit_id,'minutes.manage');
 if v_meeting.status<>'waiting_for_minutes' then
   raise exception 'meeting is not awaiting minutes' using errcode='23514';
 end if;
 perform qarar_iam.consume_iam_rate_limit('minutes.generate',10,600);
 if p_client_request_id is not null then
   select * into v_request from qarar_minutes.minute_generation_requests
   where organization_id=v_org and requested_by_user_id=v_actor and client_request_id=p_client_request_id;
   if v_request.id is not null then
     return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
       'expires_at',v_request.expires_at,'generation_context',v_request.context_snapshot,'idempotent_replay',true);
   end if;
 end if;
 v_context:=qarar_minutes.build_minute_generation_context(v_meeting.id);
 insert into qarar_minutes.minute_generation_requests(
  organization_id,meeting_id,requested_by_user_id,client_request_id,context_snapshot
 ) values(v_org,v_meeting.id,v_actor,p_client_request_id,v_context)
 returning * into v_request;
 perform qarar_audit.append_audit_log(v_org,'minutes.generation_requested','minute_generation_requests',v_request.id,
   jsonb_build_object('meeting_id',v_meeting.id));
 return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
   'expires_at',v_request.expires_at,'generation_context',v_context,'idempotent_replay',false);
end;
$$;

create or replace function qarar_minutes.service_complete_minute_generation(
  p_request_id uuid,p_generated_content text,p_provider text,p_model text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_audit
as $$
declare v_request qarar_minutes.minute_generation_requests%rowtype;
  v_meeting qarar_meetings.meetings%rowtype; v_minute qarar_minutes.meeting_minutes%rowtype;
  v_revision_id uuid; v_revision_no integer; v_changed timestamptz;
begin
 if nullif(btrim(p_generated_content),'') is null then raise exception 'generated content is required' using errcode='22023'; end if;
 select * into v_request from qarar_minutes.minute_generation_requests where id=p_request_id for update;
 if v_request.id is null then raise exception 'generation request not found' using errcode='P0002'; end if;
 if v_request.status<>'queued' then
   return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'idempotent_replay',v_request.status='succeeded');
 end if;
 if v_request.expires_at<=clock_timestamp() then
   update qarar_minutes.minute_generation_requests set status='expired',completed_at=clock_timestamp(),error_code='request_expired' where id=v_request.id;
   return jsonb_build_object('request_id',v_request.id,'status','expired');
 end if;
 select * into v_meeting from qarar_meetings.meetings where id=v_request.meeting_id and organization_id=v_request.organization_id for update;
 if v_meeting.status<>'waiting_for_minutes' then
   update qarar_minutes.minute_generation_requests set status='failed',completed_at=clock_timestamp(),error_code='meeting_not_awaiting_minutes' where id=v_request.id;
   return jsonb_build_object('request_id',v_request.id,'status','failed','error_code','meeting_not_awaiting_minutes');
 end if;
 select * into v_minute from qarar_minutes.meeting_minutes
 where meeting_id=v_meeting.id for update;
 if v_minute.id is null then
   insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,content_draft,status,generated_by_ai,generated_at,created_by_user_id,current_revision_no)
   values(v_request.organization_id,v_meeting.id,btrim(p_generated_content),'generated',true,clock_timestamp(),v_request.requested_by_user_id,1)
   returning * into v_minute;
   v_revision_no:=1;
   insert into qarar_minutes.minute_status_history(organization_id,minute_id,to_status,changed_by_user_id,reason)
   values(v_request.organization_id,v_minute.id,'generated',v_request.requested_by_user_id,'ai_draft_generated');
 elsif v_minute.status in ('draft','generated') then
   update qarar_minutes.meeting_minutes set content_draft=btrim(p_generated_content),status='generated',generated_by_ai=true,
     generated_at=clock_timestamp(),current_revision_no=current_revision_no+1
   where id=v_minute.id returning updated_at,current_revision_no into v_changed,v_revision_no;
   if v_minute.status<>'generated' then
     insert into qarar_minutes.minute_status_history(organization_id,minute_id,from_status,to_status,changed_by_user_id,reason)
     values(v_request.organization_id,v_minute.id,v_minute.status,'generated',v_request.requested_by_user_id,'ai_draft_generated');
   end if;
 else
   update qarar_minutes.minute_generation_requests set status='failed',completed_at=clock_timestamp(),error_code='minute_not_editable' where id=v_request.id;
   return jsonb_build_object('request_id',v_request.id,'status','failed','error_code','minute_not_editable');
 end if;
 insert into qarar_minutes.minute_revisions(organization_id,minute_id,revision_no,content,source,created_by_user_id,generation_metadata)
 values(v_request.organization_id,v_minute.id,v_revision_no,btrim(p_generated_content),'ai_generated',v_request.requested_by_user_id,
   jsonb_build_object('provider',nullif(btrim(p_provider),''),'model',nullif(btrim(p_model),''),'request_id',v_request.id))
 returning id into v_revision_id;
 update qarar_minutes.minute_generation_requests set status='succeeded',provider=nullif(btrim(p_provider),''),model=nullif(btrim(p_model),''),
  output_revision_id=v_revision_id,completed_at=clock_timestamp() where id=v_request.id;
 perform qarar_audit.append_audit_log(v_request.organization_id,'minutes.generation_completed','meeting_minutes',v_minute.id,
  jsonb_build_object('request_id',v_request.id,'revision_id',v_revision_id));
 return jsonb_build_object('request_id',v_request.id,'status','succeeded','minute_id',v_minute.id,
  'revision_id',v_revision_id,'revision_no',v_revision_no,'minute_status','generated');
end;
$$;

create or replace function qarar_minutes.service_fail_minute_generation(
  p_request_id uuid,p_error_code text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_audit
as $$
declare v_request qarar_minutes.minute_generation_requests%rowtype;
begin
 select * into v_request from qarar_minutes.minute_generation_requests where id=p_request_id for update;
 if v_request.id is null then raise exception 'generation request not found' using errcode='P0002'; end if;
 if v_request.status='queued' then
  update qarar_minutes.minute_generation_requests set status='failed',error_code=left(coalesce(nullif(btrim(p_error_code),''),'provider_failed'),80),completed_at=clock_timestamp() where id=v_request.id;
  perform qarar_audit.append_audit_log(v_request.organization_id,'minutes.generation_failed','minute_generation_requests',v_request.id,
   jsonb_build_object('error_code',left(coalesce(nullif(btrim(p_error_code),''),'provider_failed'),80)));
 end if;
 return jsonb_build_object('request_id',v_request.id,'status',case when v_request.status='queued' then 'failed' else v_request.status end);
end;
$$;

alter function qarar_minutes.build_minute_generation_context(uuid) owner to qarar_minutes_executor;
alter function qarar_minutes.request_minute_generation(uuid,uuid) owner to qarar_minutes_executor;
alter function qarar_minutes.service_complete_minute_generation(uuid,text,text,text) owner to qarar_minutes_executor;
alter function qarar_minutes.service_fail_minute_generation(uuid,text) owner to qarar_minutes_executor;
revoke all on function qarar_minutes.build_minute_generation_context(uuid),qarar_minutes.request_minute_generation(uuid,uuid),
 qarar_minutes.service_complete_minute_generation(uuid,text,text,text),qarar_minutes.service_fail_minute_generation(uuid,text)
from public,anon,authenticated,service_role;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('minutes','qarar_decisions','decisions','Build a frozen AI-draft input context'),
 ('minutes','qarar_voting','voting_rounds','Build a frozen AI-draft input context')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
 ('minutes','qarar_iam','consume_iam_rate_limit','p_operation text, p_limit integer, p_window_seconds integer','Rate limit minute generation requests')
on conflict do nothing;
grant usage on schema qarar_decisions,qarar_voting to qarar_minutes_executor;
grant select on qarar_decisions.decisions,qarar_voting.voting_rounds to qarar_minutes_executor;
grant execute on function qarar_iam.consume_iam_rate_limit(text,integer,integer) to qarar_minutes_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'minutes','qarar_minutes',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_minutes' and p.proname in(
 'build_minute_generation_context','request_minute_generation','service_complete_minute_generation','service_fail_minute_generation')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
 module_code='minutes',owning_schema='qarar_minutes',is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
 ('v1','request_minute_generation','qarar_minutes','request_minute_generation','p_meeting_id uuid, p_client_request_id uuid','minutes','authenticated'),
 ('v1','service_complete_minute_generation','qarar_minutes','service_complete_minute_generation','p_request_id uuid, p_generated_content text, p_provider text, p_model text','minutes','service_role'),
 ('v1','service_fail_minute_generation','qarar_minutes','service_fail_minute_generation','p_request_id uuid, p_error_code text','minutes','service_role')
on conflict do nothing;

do $$
declare c record;f record;args text;call_args text;sql text;
begin
 for c in select * from qarar_architecture.api_contract_registry where api_version='v1' and contract_name in(
  'request_minute_generation','service_complete_minute_generation','service_fail_minute_generation')
 loop
  select p.oid,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname=c.implementation_schema and p.proname=c.implementation_name
   and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
  select string_agg(split_part(btrim(a),' ',1),',' order by ord) into call_args
  from unnest(string_to_array(c.identity_arguments,',')) with ordinality z(a,ord);
  sql:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',c.contract_name,f.arguments,f.result,c.implementation_schema,c.implementation_name,call_args);
  execute sql;
  execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
  execute format('revoke all on function api_v1.%I(%s) from public,anon,authenticated,service_role',c.contract_name,c.identity_arguments);
  if c.audience='authenticated' then
   execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
  else
   execute format('grant execute on function api_v1.%I(%s) to service_role',c.contract_name,c.identity_arguments);
  end if;
  execute 'grant usage on schema qarar_minutes to qarar_api_executor';
  execute format('grant execute on function qarar_minutes.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
 end loop;
end;
$$;

commit;
