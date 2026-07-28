begin;

alter table qarar_minutes.meeting_minutes
  add column if not exists approval_round_no integer not null default 0 check (approval_round_no >= 0);
alter table qarar_minutes.minute_approvals
  add column if not exists approval_round_no integer not null default 1 check (approval_round_no > 0),
  add column if not exists revision_no integer not null default 1 check (revision_no > 0);
alter table qarar_minutes.minute_approvals
  drop constraint if exists minute_approvals_minute_id_user_id_key;
alter table qarar_minutes.minute_approvals
  add constraint minute_approvals_minute_user_round_key unique(minute_id,user_id,approval_round_no);
create index minute_approvals_round_idx
  on qarar_minutes.minute_approvals(organization_id,minute_id,approval_round_no,approval_status);

create or replace function qarar_minutes.submit_minute_for_approval(
 p_minute_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_core,qarar_iam,qarar_audit
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
 v_minute qarar_minutes.meeting_minutes%rowtype; v_meeting qarar_meetings.meetings%rowtype;
 v_rule text; v_round integer; v_changed timestamptz; v_approvers integer;
begin
 select * into v_minute from qarar_minutes.meeting_minutes where id=p_minute_id and organization_id=v_org for update;
 if v_minute.id is null then raise exception 'minute not found' using errcode='P0002'; end if;
 select * into v_meeting from qarar_meetings.meetings where id=v_minute.meeting_id and organization_id=v_org for update;
 perform qarar_minutes.assert_minute_access(v_meeting.governance_unit_id,'minutes.manage');
 if v_minute.status not in('draft','generated') then raise exception 'minute is not ready for submission' using errcode='23514'; end if;
 if nullif(btrim(v_minute.content_draft),'') is null or v_minute.current_revision_no=0 then
   raise exception 'minute requires a non-empty current revision' using errcode='23514';
 end if;
 if v_meeting.status<>'waiting_for_minutes' then raise exception 'meeting is not awaiting minutes' using errcode='23514'; end if;
 select minute_approval_rule into v_rule from qarar_core.governance_units where id=v_meeting.governance_unit_id;
 v_round:=v_minute.approval_round_no+1;
 update qarar_minutes.meeting_minutes set status='ready_for_approval',approval_round_no=v_round,
   reviewed_by_user_id=v_actor,reviewed_at=clock_timestamp()
 where id=v_minute.id and updated_at=p_expected_updated_at returning updated_at into v_changed;
 if v_changed is null then raise exception 'minute has changed; reload it before submitting' using errcode='40001'; end if;
 if v_rule='chair_and_rapporteur' then
  insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id,approval_round_no,revision_no)
  select v_org,v_minute.id,m.user_id,m.id,v_round,v_minute.current_revision_no
  from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
  where m.organization_id=v_org and m.governance_unit_id=v_meeting.governance_unit_id
   and m.membership_status='active' and (m.end_date is null or m.end_date>=current_date)
   and r.code in('council_chair','council_rapporteur')
  on conflict(minute_id,user_id,approval_round_no) do nothing;
 elsif v_rule='all_present_members' then
  insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id,approval_round_no,revision_no)
  select v_org,v_minute.id,a.user_id,a.membership_id,v_round,v_minute.current_revision_no
  from qarar_attendance.attendance_records a
  where a.organization_id=v_org and a.meeting_id=v_meeting.id and a.attendance_status in('present','late')
  on conflict(minute_id,user_id,approval_round_no) do nothing;
 else raise exception 'unsupported minute approval rule' using errcode='23514';
 end if;
 select count(*) into v_approvers from qarar_minutes.minute_approvals
 where minute_id=v_minute.id and approval_round_no=v_round;
 if v_approvers=0 then raise exception 'approval rule produced no active approvers' using errcode='23514'; end if;
 update qarar_meetings.meetings set status='waiting_for_approval' where id=v_meeting.id and status='waiting_for_minutes';
 insert into qarar_minutes.minute_status_history(organization_id,minute_id,from_status,to_status,changed_by_user_id,reason)
 values(v_org,v_minute.id,v_minute.status,'ready_for_approval',v_actor,'submitted_for_human_approval');
 perform qarar_audit.append_audit_log(v_org,'minutes.submitted_for_approval','meeting_minutes',v_minute.id,
  jsonb_build_object('approval_round_no',v_round,'revision_no',v_minute.current_revision_no,'approver_count',v_approvers));
 return jsonb_build_object('minute_id',v_minute.id,'status','ready_for_approval','approval_round_no',v_round,
  'revision_no',v_minute.current_revision_no,'meeting_status','waiting_for_approval','updated_at',v_changed);
end;
$$;

create or replace function qarar_minutes.decide_minute_approval(
 p_approval_id uuid,p_decision text,p_note text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_iam,qarar_audit
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
 v_approval qarar_minutes.minute_approvals%rowtype; v_minute qarar_minutes.meeting_minutes%rowtype;
 v_meeting qarar_meetings.meetings%rowtype; v_pending integer; v_rejected integer; v_changed timestamptz;
begin
 if p_decision not in('approved','rejected') then raise exception 'invalid approval decision' using errcode='22023'; end if;
 select * into v_approval from qarar_minutes.minute_approvals where id=p_approval_id and organization_id=v_org for update;
 if v_approval.id is null then raise exception 'approval task not found' using errcode='P0002'; end if;
 if v_approval.user_id<>v_actor then raise exception 'approval task is assigned to another user' using errcode='42501'; end if;
 if v_approval.approval_status<>'pending' then raise exception 'approval task is already resolved' using errcode='23505'; end if;
 select * into v_minute from qarar_minutes.meeting_minutes where id=v_approval.minute_id and organization_id=v_org for update;
 select * into v_meeting from qarar_meetings.meetings where id=v_minute.meeting_id and organization_id=v_org for update;
 if v_minute.status<>'ready_for_approval' or v_minute.approval_round_no<>v_approval.approval_round_no then
  raise exception 'approval task is no longer active' using errcode='23514';
 end if;
 update qarar_minutes.minute_approvals set approval_status=p_decision,notes=nullif(btrim(p_note),''),resolved_at=clock_timestamp()
 where id=v_approval.id and updated_at=p_expected_updated_at returning updated_at into v_changed;
 if v_changed is null then raise exception 'approval task has changed; reload it before deciding' using errcode='40001'; end if;
 if p_decision='rejected' then
  update qarar_minutes.meeting_minutes set status='draft' where id=v_minute.id;
  update qarar_meetings.meetings set status='waiting_for_minutes' where id=v_meeting.id and status='waiting_for_approval';
  insert into qarar_minutes.minute_status_history(organization_id,minute_id,from_status,to_status,changed_by_user_id,reason)
  values(v_org,v_minute.id,'ready_for_approval','draft',v_actor,'approval_rejected');
  perform qarar_audit.append_audit_log(v_org,'minutes.approval_rejected','minute_approvals',v_approval.id,
   jsonb_build_object('minute_id',v_minute.id,'approval_round_no',v_approval.approval_round_no));
  return jsonb_build_object('approval_id',v_approval.id,'decision','rejected','minute_status','draft','meeting_status','waiting_for_minutes','updated_at',v_changed);
 end if;
 select count(*),count(*) filter(where approval_status='rejected') into v_pending,v_rejected
 from qarar_minutes.minute_approvals where minute_id=v_minute.id and approval_round_no=v_approval.approval_round_no and approval_status='pending';
 if v_rejected>0 then raise exception 'approval round contains a rejection' using errcode='23514'; end if;
 if v_pending>0 then
  perform qarar_audit.append_audit_log(v_org,'minutes.approval_recorded','minute_approvals',v_approval.id,
   jsonb_build_object('minute_id',v_minute.id,'approval_round_no',v_approval.approval_round_no));
  return jsonb_build_object('approval_id',v_approval.id,'decision','approved','minute_status','ready_for_approval','meeting_status','waiting_for_approval','updated_at',v_changed);
 end if;
 update qarar_minutes.meeting_minutes set status='approved',content_final=content_draft,approved_at=clock_timestamp() where id=v_minute.id;
 update qarar_meetings.meetings set status='closed' where id=v_meeting.id and status='waiting_for_approval';
 insert into qarar_minutes.minute_status_history(organization_id,minute_id,from_status,to_status,changed_by_user_id,reason)
 values(v_org,v_minute.id,'ready_for_approval','approved',v_actor,'all_human_approvals_recorded');
 perform qarar_audit.append_audit_log(v_org,'minutes.approved_and_meeting_closed','meeting_minutes',v_minute.id,
  jsonb_build_object('approval_round_no',v_approval.approval_round_no));
 return jsonb_build_object('approval_id',v_approval.id,'decision','approved','minute_status','approved','meeting_status','closed','updated_at',v_changed);
end;
$$;

alter function qarar_minutes.submit_minute_for_approval(uuid,timestamptz) owner to qarar_minutes_executor;
alter function qarar_minutes.decide_minute_approval(uuid,text,text,timestamptz) owner to qarar_minutes_executor;
revoke all on function qarar_minutes.submit_minute_for_approval(uuid,timestamptz),qarar_minutes.decide_minute_approval(uuid,text,text,timestamptz)
from public,anon,authenticated,service_role;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('minutes','qarar_attendance','attendance_records','Create all-present approval tasks from the governed attendance roster')
on conflict do nothing;
grant select on qarar_attendance.attendance_records to qarar_minutes_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'minutes','qarar_minutes',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_minutes' and p.proname in('submit_minute_for_approval','decide_minute_approval')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code='minutes',owning_schema='qarar_minutes',is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
 ('v1','submit_minute_for_approval','qarar_minutes','submit_minute_for_approval','p_minute_id uuid, p_expected_updated_at timestamp with time zone','minutes','authenticated'),
 ('v1','decide_minute_approval','qarar_minutes','decide_minute_approval','p_approval_id uuid, p_decision text, p_note text, p_expected_updated_at timestamp with time zone','minutes','authenticated')
on conflict do nothing;
do $$
declare c record;f record;call_args text;
begin
 for c in select * from qarar_architecture.api_contract_registry where api_version='v1' and contract_name in('submit_minute_for_approval','decide_minute_approval') loop
  select p.oid,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname=c.implementation_schema and p.proname=c.implementation_name and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
  select string_agg(split_part(btrim(a),' ',1),',' order by ord) into call_args from unnest(string_to_array(c.identity_arguments,',')) with ordinality z(a,ord);
  execute format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',c.contract_name,f.arguments,f.result,c.implementation_schema,c.implementation_name,call_args);
  execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
  execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
  execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
  execute format('grant execute on function qarar_minutes.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
 end loop;
end;
$$;

commit;
