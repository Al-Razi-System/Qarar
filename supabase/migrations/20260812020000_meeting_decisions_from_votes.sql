-- Formalize an approved voting result as a governed decision.
-- A decision is intentionally created only after a closed, approved round.

create unique index if not exists decisions_one_per_agenda_item_idx
  on qarar_decisions.decisions(organization_id, agenda_item_id)
  where agenda_item_id is not null;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('decisions','qarar_voting','voting_rounds','Create a decision only from an approved closed voting round'),
 ('decisions','qarar_meetings','meetings','Bind the decision to its tenant-scoped meeting'),
 ('decisions','qarar_meetings','agenda_items','Resolve the voted agenda topic')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
 ('decisions','qarar_iam','current_organization_id','','Resolve the caller tenant'),
 ('decisions','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Authorize decision creation'),
 ('decisions','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Authorize decision reads'),
 ('decisions','qarar_iam','is_system_admin','','Evaluate system administration scope'),
 ('decisions','qarar_audit','append_audit_log','p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Record immutable decision creation evidence')
on conflict do nothing;
grant usage on schema qarar_voting,qarar_meetings,qarar_iam,qarar_audit to qarar_decisions_executor;
grant select on qarar_voting.voting_rounds,qarar_meetings.meetings,qarar_meetings.agenda_items to qarar_decisions_executor;
grant execute on function qarar_iam.current_organization_id(),qarar_iam.assert_permission(text,uuid),qarar_iam.has_permission(text,uuid),qarar_iam.is_system_admin(),qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) to qarar_decisions_executor;

create or replace function qarar_decisions.create_decision_from_voting_round(
  p_voting_round_id uuid,
  p_decision_text text,
  p_requires_approval boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_round qarar_voting.voting_rounds%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_topic_id uuid;
  v_decision_id uuid;
  v_decision_no text;
  v_existing jsonb;
begin
  if char_length(btrim(coalesce(p_decision_text,''))) < 10 then
    raise exception 'decision text must contain at least 10 characters' using errcode='22023';
  end if;

  select * into v_round from qarar_voting.voting_rounds
   where id=p_voting_round_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_round.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
  if v_round.status <> 'closed' or v_round.result <> 'approved' then
    raise exception 'only a closed approved voting round can create a decision' using errcode='23514';
  end if;

  select * into v_meeting from qarar_meetings.meetings
   where id=v_round.meeting_id and organization_id=v_round.organization_id;
  if v_meeting.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('decisions.create', v_meeting.governance_unit_id);

  select topic_id into v_topic_id from qarar_meetings.agenda_items
   where id=v_round.agenda_item_id and organization_id=v_round.organization_id;
  if v_topic_id is null then raise exception 'agenda item not found' using errcode='P0002'; end if;

  select jsonb_build_object('id',id,'decision_no',decision_no,'decision_status',decision_status)
    into v_existing from qarar_decisions.decisions
   where organization_id=v_round.organization_id and agenda_item_id=v_round.agenda_item_id;
  if v_existing is not null then return v_existing || jsonb_build_object('already_exists',true); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_round.organization_id::text || ':decision', 0));
  select 'DEC-' || to_char(current_date,'YYYY') || '-' || lpad((count(*) + 1)::text, 6, '0')
    into v_decision_no from qarar_decisions.decisions
   where organization_id=v_round.organization_id and extract(year from created_at)=extract(year from current_date);

  insert into qarar_decisions.decisions(
    organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,
    decision_text,decision_status,issued_at,issued_by_user_id,requires_approval
  ) values (
    v_round.organization_id,v_decision_no,v_topic_id,v_meeting.id,v_round.agenda_item_id,v_meeting.governance_unit_id,
    btrim(p_decision_text),case when p_requires_approval then 'ready_for_approval' else 'approved' end,
    case when p_requires_approval then null else clock_timestamp() end,auth.uid(),p_requires_approval
  ) returning id into v_decision_id;

  perform qarar_audit.append_audit_log(v_round.organization_id,'decision.create_from_vote','decisions',v_decision_id,
    jsonb_build_object('voting_round_id',v_round.id,'meeting_id',v_meeting.id,'agenda_item_id',v_round.agenda_item_id));
  return jsonb_build_object('id',v_decision_id,'decision_no',v_decision_no,
    'decision_status',case when p_requires_approval then 'ready_for_approval' else 'approved' end,'already_exists',false);
end $$;

create or replace function qarar_decisions.list_meeting_decisions(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'decision_no',d.decision_no,'agenda_item_id',d.agenda_item_id,
    'decision_text',d.decision_text,'decision_status',d.decision_status,'requires_approval',d.requires_approval
  ) order by d.created_at),'[]'::jsonb)
  from qarar_decisions.decisions d
  join qarar_meetings.meetings m on m.id=d.meeting_id
  where d.meeting_id=p_meeting_id and d.organization_id=qarar_iam.current_organization_id()
    and (qarar_iam.is_system_admin() or qarar_iam.has_permission('decisions.read',m.governance_unit_id))
$$;

create or replace function qarar_voting.list_meeting_voting_rounds(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',vr.id,'agenda_item_id',vr.agenda_item_id,'status',vr.status,'result',vr.result,
    'approve_count',vr.approve_count,'reject_count',vr.reject_count,'abstain_count',vr.abstain_count
  ) order by vr.opened_at),'[]'::jsonb)
  from qarar_voting.voting_rounds vr
  join qarar_meetings.meetings m on m.id=vr.meeting_id
  where vr.meeting_id=p_meeting_id and vr.organization_id=qarar_iam.current_organization_id()
    and (qarar_iam.is_system_admin() or qarar_iam.has_permission('voting.read',m.governance_unit_id)
      or qarar_iam.has_permission('voting.manage',m.governance_unit_id))
$$;

create or replace function api_v1.create_decision_from_voting_round(
  p_voting_round_id uuid,p_decision_text text,p_requires_approval boolean default true
) returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select qarar_decisions.create_decision_from_voting_round($1,$2,$3)
$$;

create or replace function api_v1.list_meeting_decisions(p_meeting_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select qarar_decisions.list_meeting_decisions($1)
$$;

create or replace function api_v1.list_meeting_voting_rounds(p_meeting_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select qarar_voting.list_meeting_voting_rounds($1)
$$;

alter function qarar_decisions.create_decision_from_voting_round(uuid,text,boolean) owner to qarar_decisions_executor;
alter function qarar_decisions.list_meeting_decisions(uuid) owner to qarar_decisions_executor;
alter function qarar_voting.list_meeting_voting_rounds(uuid) owner to qarar_voting_executor;
revoke all on function qarar_decisions.create_decision_from_voting_round(uuid,text,boolean),
  qarar_decisions.list_meeting_decisions(uuid),qarar_voting.list_meeting_voting_rounds(uuid)
from public,anon,authenticated,service_role;
grant execute on function qarar_decisions.create_decision_from_voting_round(uuid,text,boolean),
  qarar_decisions.list_meeting_decisions(uuid),qarar_voting.list_meeting_voting_rounds(uuid)
to qarar_api_executor;

alter function api_v1.create_decision_from_voting_round(uuid,text,boolean) owner to qarar_api_executor;
alter function api_v1.list_meeting_decisions(uuid) owner to qarar_api_executor;
alter function api_v1.list_meeting_voting_rounds(uuid) owner to qarar_api_executor;

grant execute on function api_v1.create_decision_from_voting_round(uuid,text,boolean), api_v1.list_meeting_decisions(uuid), api_v1.list_meeting_voting_rounds(uuid) to authenticated,service_role;
revoke execute on function api_v1.create_decision_from_voting_round(uuid,text,boolean), api_v1.list_meeting_decisions(uuid), api_v1.list_meeting_voting_rounds(uuid) from public,anon;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  case when n.nspname='qarar_voting' then 'voting' else 'decisions' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='qarar_decisions' and p.proname in ('create_decision_from_voting_round','list_meeting_decisions'))
   or (n.nspname='qarar_voting' and p.proname='list_meeting_voting_rounds')
  and not exists (
    select 1 from qarar_architecture.function_registry existing
    where existing.function_name=p.proname and existing.identity_arguments=pg_get_function_identity_arguments(p.oid)
  )
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
  ('v1','create_decision_from_voting_round','qarar_decisions','create_decision_from_voting_round','p_voting_round_id uuid, p_decision_text text, p_requires_approval boolean','decisions','authenticated'),
  ('v1','list_meeting_decisions','qarar_decisions','list_meeting_decisions','p_meeting_id uuid','decisions','authenticated')
 ,('v1','list_meeting_voting_rounds','qarar_voting','list_meeting_voting_rounds','p_meeting_id uuid','voting','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
