-- A rejected vote whose saved stage policy says "chair decides" pauses the
-- route until the contextual chair either ends it or returns it one council.
-- Existing transition policies remain unchanged.
-- Impact map: docs/engineering/impact/CROSS_COUNCIL_TOPIC_RETURN_20261027_AR.md
begin;

alter table qarar_decisions.decisions drop constraint decisions_outcome_kind_check;
alter table qarar_decisions.decisions add constraint decisions_outcome_kind_check
  check (outcome_kind in ('approval','rejection','undecided','postponement','referral','return'));

create table qarar_voting.rejected_vote_resolutions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  voting_round_id uuid not null,
  meeting_id uuid not null,
  agenda_item_id uuid not null,
  topic_id uuid not null,
  workflow_instance_step_id uuid not null,
  status text not null default 'pending',
  resolution text,
  reason text,
  expected_step_version integer not null,
  action_version integer not null default 0,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  idempotency_key uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),
  unique(voting_round_id),
  unique(organization_id,idempotency_key),
  foreign key(voting_round_id,organization_id) references qarar_voting.voting_rounds(id,organization_id) on delete restrict,
  foreign key(meeting_id,organization_id) references qarar_meetings.meetings(id,organization_id) on delete restrict,
  foreign key(agenda_item_id,organization_id) references qarar_meetings.agenda_items(id,organization_id) on delete restrict,
  foreign key(topic_id,organization_id) references qarar_topics.topics(id,organization_id) on delete restrict,
  foreign key(workflow_instance_step_id,organization_id) references qarar_governance.workflow_instance_steps(id,organization_id) on delete restrict,
  foreign key(resolved_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(status in ('pending','resolved')),
  check(resolution is null or resolution in ('final_reject','return_previous')),
  check((status='pending' and resolution is null and resolved_by_user_id is null and resolved_at is null)
    or (status='resolved' and resolution is not null and resolved_by_user_id is not null and resolved_at is not null)),
  check(reason is null or char_length(btrim(reason))>=10),
  check(expected_step_version>=0 and action_version>=0)
);
alter table qarar_voting.rejected_vote_resolutions owner to qarar_voting_executor;
revoke all on qarar_voting.rejected_vote_resolutions from public,anon,authenticated,service_role;
alter table qarar_voting.rejected_vote_resolutions enable row level security;
create index rejected_vote_resolutions_meeting_pending_idx
  on qarar_voting.rejected_vote_resolutions(meeting_id,status,created_at);

-- Add the new authoring policy without rewriting any stored policy. It is
-- represented by a rejected terminal transition carrying an explicit flag,
-- so all pre-existing transition types retain their exact semantics.
do $$
declare v_definition text; v_changed text;
begin
  select pg_get_functiondef('qarar_governance.save_governance_bundle_layout_policy_v2(uuid,integer,uuid,jsonb)'::regprocedure)
    into v_definition;
  v_changed:=replace(v_definition,
    $needle$coalesce(policy->>'rejected','') not in ('advance','complete','return_previous')$needle$,
    $replacement$coalesce(policy->>'rejected','') not in ('advance','complete','return_previous','chair_decides')$replacement$);
  v_changed:=replace(v_changed,
    $needle$insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type)
    values(o,vid,steps[i],dest,outcome,case behavior when 'advance' then 'forward' when 'return_previous' then 'return' else case outcome when 'rejected' then 'reject' else 'complete' end end);$needle$,
    $replacement$insert into qarar_governance.workflow_template_transitions(organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type,conditions)
    values(o,vid,steps[i],dest,outcome,case behavior when 'advance' then 'forward' when 'return_previous' then 'return' else case outcome when 'rejected' then 'reject' else 'complete' end end,
      case when outcome='rejected' and behavior='chair_decides' then jsonb_build_object('chair_decides',true) else '{}'::jsonb end);$replacement$);
  if v_changed=v_definition or position('chair_decides' in v_changed)=0 then
    raise exception using errcode='55000',message='تعذر تحديث عقد سياسة الرفض بأمان.';
  end if;
  execute v_changed;
end;
$$;

create function qarar_governance.rejected_vote_requires_chair_decision(p_workflow_instance_step_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce((tr.conditions->>'chair_decides')::boolean,false)
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id and ts.organization_id=s.organization_id
  left join qarar_governance.workflow_template_transitions tr
    on tr.workflow_template_version_id=ts.workflow_template_version_id
   and tr.from_step_id=ts.id and tr.outcome_code='rejected'
  where s.id=p_workflow_instance_step_id and s.organization_id=qarar_iam.current_organization_id()
$$;
alter function qarar_governance.rejected_vote_requires_chair_decision(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.rejected_vote_requires_chair_decision(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.rejected_vote_requires_chair_decision(uuid) to qarar_voting_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='rejected_vote_requires_chair_decision'
on conflict do nothing;

create function qarar_governance.previous_step_destination_name(p_workflow_instance_step_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(u.name_ar,'مقدم الموضوع')
  from qarar_governance.workflow_instance_steps current_s
  left join qarar_governance.workflow_instance_steps prev_s
    on prev_s.workflow_instance_id=current_s.workflow_instance_id and prev_s.sequence_no=current_s.sequence_no-1
  left join qarar_core.governance_units u on u.id=prev_s.assigned_unit_id and u.organization_id=prev_s.organization_id
  where current_s.id=p_workflow_instance_step_id and current_s.organization_id=qarar_iam.current_organization_id()
$$;
alter function qarar_governance.previous_step_destination_name(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.previous_step_destination_name(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.previous_step_destination_name(uuid) to qarar_voting_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='previous_step_destination_name'
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_governance','previous_step_destination_name','p_workflow_instance_step_id uuid','Show the exact lower council without granting voting direct access to governance ownership data')
on conflict do nothing;

create function qarar_governance.is_current_active_topic_step(
  p_topic_id uuid,p_workflow_instance_step_id uuid,p_expected_version integer
) returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from qarar_topics.topics t
    join qarar_governance.workflow_instance_steps s
      on s.id=t.current_workflow_step_id and s.workflow_instance_id=t.workflow_instance_id
    where t.id=p_topic_id and t.organization_id=qarar_iam.current_organization_id()
      and s.id=p_workflow_instance_step_id and s.status='active' and s.action_version=p_expected_version
  )
$$;
alter function qarar_governance.is_current_active_topic_step(uuid,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.is_current_active_topic_step(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.is_current_active_topic_step(uuid,uuid,integer) to qarar_voting_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='is_current_active_topic_step'
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_governance','is_current_active_topic_step','p_topic_id uuid, p_workflow_instance_step_id uuid, p_expected_version integer','Verify the vote still belongs to the current active topic step without cross-module table grants')
on conflict do nothing;
create function qarar_governance.current_active_topic_title(
  p_topic_id uuid,p_workflow_instance_step_id uuid,p_expected_version integer
) returns text language sql stable security definer set search_path=pg_catalog
as $$
  select t.title_ar from qarar_topics.topics t
  join qarar_governance.workflow_instance_steps s
    on s.id=t.current_workflow_step_id and s.workflow_instance_id=t.workflow_instance_id
  where t.id=p_topic_id and t.organization_id=qarar_iam.current_organization_id()
    and s.id=p_workflow_instance_step_id and s.status='active' and s.action_version=p_expected_version
$$;
alter function qarar_governance.current_active_topic_title(uuid,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.current_active_topic_title(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.current_active_topic_title(uuid,uuid,integer) to qarar_voting_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='current_active_topic_title'
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_governance','current_active_topic_title','p_topic_id uuid, p_workflow_instance_step_id uuid, p_expected_version integer','Read the route topic title only after verifying its current active step')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_governance','rejected_vote_requires_chair_decision','p_workflow_instance_step_id uuid','Read the frozen rejection policy without granting voting direct access to governance tables')
on conflict do nothing;

create or replace function qarar_voting.advance_governed_workflow_from_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_topic_id uuid;
  v_current_step_id uuid;
  v_action_version integer;
  v_step_type text;
  v_outcome text;
  v_chair_decides boolean:=false;
begin
  if new.status<>'closed' or old.status='closed' or new.workflow_instance_step_id is null then return new; end if;
  if new.result not in('approved','rejected','tied','no_votes') then
    raise exception using errcode='22023',message='نتيجة جولة التصويت لا تحرك مسار الحوكمة';
  end if;
  select a.topic_id into v_topic_id from qarar_meetings.agenda_items a
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;
  select t.current_workflow_step_id into v_current_step_id from qarar_topics.topics t
  where t.id=v_topic_id and t.organization_id=new.organization_id and t.routing_status='routing_ready';
  if v_current_step_id is distinct from new.workflow_instance_step_id then
    raise exception using errcode='40001',message='تغيرت خطوة المسار منذ فتح التصويت؛ لا يمكن تطبيق نتيجة جولة قديمة';
  end if;
  select s.action_version,ts.step_type
    into v_action_version,v_step_type
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=new.workflow_instance_step_id and s.organization_id=new.organization_id and s.status='active';
  if v_action_version is null then
    raise exception using errcode='40001',message='خطوة المسار المرتبطة بالتصويت غير نشطة';
  end if;
  v_chair_decides:=qarar_governance.rejected_vote_requires_chair_decision(new.workflow_instance_step_id);
  if v_step_type<>'voting' and new.result not in('approved','rejected') then
    perform qarar_audit.append_audit_log(new.organization_id,'voting.route_unchanged','voting_rounds',new.id,
      jsonb_build_object('result',new.result,'workflow_instance_step_id',new.workflow_instance_step_id));
    return new;
  end if;
  if new.result='rejected' and v_chair_decides then
    insert into qarar_voting.rejected_vote_resolutions(
      organization_id,voting_round_id,meeting_id,agenda_item_id,topic_id,
      workflow_instance_step_id,expected_step_version
    ) values (
      new.organization_id,new.id,new.meeting_id,new.agenda_item_id,v_topic_id,
      new.workflow_instance_step_id,v_action_version
    ) on conflict(voting_round_id) do nothing;
    perform qarar_audit.append_audit_log(new.organization_id,'voting.rejection_waiting_for_chair',
      'voting_rounds',new.id,jsonb_build_object('topic_id',v_topic_id,'workflow_instance_step_id',new.workflow_instance_step_id));
    return new;
  end if;
  v_outcome:=case new.result when 'approved' then 'approved' when 'rejected' then 'rejected' when 'tied' then 'tie' when 'no_votes' then 'no_vote' end;
  perform set_config('qarar.voting_transition','on',true);
  perform set_config('qarar.voting_round_id',new.id::text,true);
  perform qarar_governance.act_topic_workflow_step(v_topic_id,v_outcome,'نتيجة التصويت '||new.id,new.id,v_action_version);
  return new;
end;
$$;
alter function qarar_voting.advance_governed_workflow_from_vote() owner to qarar_voting_executor;

create function qarar_voting.list_pending_rejected_vote_resolutions(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_unit uuid; v_items jsonb;
begin
  select governance_unit_id into v_unit from qarar_meetings.meetings where id=p_meeting_id and organization_id=v_org;
  if v_unit is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  if not qarar_iam.has_unit_role_code(v_unit,array['council_chair']) then
    return jsonb_build_object('items','[]'::jsonb,'can_resolve',false);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'voting_round_id',r.voting_round_id,'agenda_item_id',r.agenda_item_id,
    'topic_id',r.topic_id,'topic_title',t.title_ar,'expected_version',r.action_version,
    'step_expected_version',r.expected_step_version,
    'destination_unit_name_ar',qarar_governance.previous_step_destination_name(r.workflow_instance_step_id)
  ) order by r.created_at),'[]'::jsonb) into v_items
  from qarar_voting.rejected_vote_resolutions r
  join qarar_topics.topics t on t.id=r.topic_id and t.organization_id=r.organization_id
  where r.meeting_id=p_meeting_id and r.organization_id=v_org and r.status='pending';
  return jsonb_build_object('items',v_items,'can_resolve',true);
end;
$$;

create function qarar_decisions.record_rejected_vote_resolution_decision(
  p_voting_round_id uuid,p_outcome_kind text,p_decision_text text
) returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_round qarar_voting.voting_rounds%rowtype; v_meeting qarar_meetings.meetings%rowtype;
  v_topic_id uuid; v_no text; v_id uuid;
begin
  if p_outcome_kind not in ('rejection','return') or char_length(btrim(coalesce(p_decision_text,'')))<10 then
    raise exception using errcode='22023',message='تعذر إنشاء قرار نتيجة الرفض.';
  end if;
  select * into v_round from qarar_voting.voting_rounds where id=p_voting_round_id and organization_id=qarar_iam.current_organization_id();
  select * into v_meeting from qarar_meetings.meetings where id=v_round.meeting_id and organization_id=v_round.organization_id;
  select topic_id into v_topic_id from qarar_meetings.agenda_items where id=v_round.agenda_item_id and organization_id=v_round.organization_id;
  if v_round.status<>'closed' or v_round.result<>'rejected' or v_meeting.id is null or v_topic_id is null then
    raise exception using errcode='55000',message='الجولة ليست نتيجة رفض صالحة لإنشاء القرار.';
  end if;
  if exists(select 1 from qarar_decisions.decisions where organization_id=v_round.organization_id and agenda_item_id=v_round.agenda_item_id) then
    raise exception using errcode='23505',message='يوجد قرار موثق لهذا البند بالفعل.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_round.organization_id::text||':decision',0));
  select 'DEC-'||to_char(current_date,'YYYY')||'-'||lpad((count(*)+1)::text,6,'0') into v_no
  from qarar_decisions.decisions where organization_id=v_round.organization_id and extract(year from created_at)=extract(year from current_date);
  insert into qarar_decisions.decisions(
    organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,
    decision_text,decision_status,issued_by_user_id,requires_approval,outcome_kind
  ) values (
    v_round.organization_id,v_no,v_topic_id,v_meeting.id,v_round.agenda_item_id,v_meeting.governance_unit_id,
    btrim(p_decision_text),'ready_for_approval',auth.uid(),true,p_outcome_kind
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_round.organization_id,'decisions.create_for_rejected_vote_resolution','decisions',v_id,
    jsonb_build_object('voting_round_id',v_round.id,'agenda_item_id',v_round.agenda_item_id,'outcome_kind',p_outcome_kind));
  return v_id;
end;
$$;
alter function qarar_decisions.record_rejected_vote_resolution_decision(uuid,text,text) owner to qarar_decisions_executor;
revoke all on function qarar_decisions.record_rejected_vote_resolution_decision(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function qarar_decisions.record_rejected_vote_resolution_decision(uuid,text,text) to qarar_voting_executor;
grant usage on schema qarar_decisions to qarar_voting_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'decisions','qarar_decisions',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_decisions' and p.proname='record_rejected_vote_resolution_decision'
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_decisions','record_rejected_vote_resolution_decision','p_voting_round_id uuid, p_outcome_kind text, p_decision_text text','Create the formal decision after the chair resolves a verified rejected vote')
on conflict do nothing;

create function qarar_voting.resolve_rejected_vote(
  p_voting_round_id uuid,p_resolution text,p_reason text,p_idempotency_key uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
  v_resolution qarar_voting.rejected_vote_resolutions%rowtype;
  v_round qarar_voting.voting_rounds%rowtype; v_meeting qarar_meetings.meetings%rowtype;
  v_topic_title text;
  v_destination text;
  v_decision_text text; v_decision_id uuid; v_outcome text;
begin
  if p_resolution not in ('final_reject','return_previous') then
    raise exception using errcode='22023',message='اختر إنهاء الموضوع أو إعادته للمجلس السابق.';
  end if;
  if p_idempotency_key is null then raise exception using errcode='22023',message='تعذر تأكيد العملية؛ أعد المحاولة.'; end if;
  select * into v_resolution from qarar_voting.rejected_vote_resolutions
  where voting_round_id=p_voting_round_id and organization_id=v_org for update;
  if v_resolution.id is null then raise exception using errcode='P0002',message='لا يوجد قرار معلق لهذه الجولة.'; end if;
  if v_resolution.status='resolved' and v_resolution.idempotency_key=p_idempotency_key then
    return jsonb_build_object('resolution_id',v_resolution.id,'idempotent_replay',true);
  end if;
  if v_resolution.status<>'pending' or p_expected_version<>v_resolution.action_version then
    raise exception using errcode='40001',message='حُسمت هذه النتيجة أو تغيرت؛ حدّث الغرفة.';
  end if;
  select * into v_round from qarar_voting.voting_rounds where id=p_voting_round_id and organization_id=v_org for update;
  select * into v_meeting from qarar_meetings.meetings where id=v_round.meeting_id and organization_id=v_org;
  if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id,array['council_chair']) then
    raise exception using errcode='42501',message='حسم نتيجة الرفض من اختصاص رئيس المجلس الحالي.';
  end if;
  if v_round.status<>'closed' or v_round.result<>'rejected' or v_round.workflow_instance_step_id<>v_resolution.workflow_instance_step_id then
    raise exception using errcode='55000',message='الجولة ليست نتيجة رفض مغلقة صالحة لهذه المرحلة.';
  end if;
  v_topic_title:=qarar_governance.current_active_topic_title(v_resolution.topic_id,v_resolution.workflow_instance_step_id,v_resolution.expected_step_version);
  if v_topic_title is null then
    raise exception using errcode='40001',message='تغيرت مرحلة الموضوع منذ إغلاق التصويت؛ حدّث الغرفة.';
  end if;
  v_destination:=qarar_governance.previous_step_destination_name(v_resolution.workflow_instance_step_id);
  if p_resolution='return_previous' then
    if char_length(btrim(coalesce(p_reason,'')))<10 then
      raise exception using errcode='22023',message='اكتب سبب الإعادة بوضوح في عشرة أحرف على الأقل.';
    end if;
    perform set_config('qarar.rejected_vote_resolution','on',true);
    perform qarar_governance.return_topic_to_previous_council(v_resolution.topic_id,btrim(p_reason),p_idempotency_key,v_resolution.expected_step_version);
    v_outcome:='return';
    v_decision_text:=format('قرر المجلس عدم الموافقة وإعادة الموضوع «%s» إلى %s، للسبب: %s',v_topic_title,v_destination,btrim(p_reason));
  else
    perform set_config('qarar.voting_transition','on',true);
    perform set_config('qarar.voting_round_id',v_round.id::text,true);
    perform qarar_governance.act_topic_workflow_step(v_resolution.topic_id,'rejected','حسم الرئيس نتيجة التصويت بالرفض',p_idempotency_key,v_resolution.expected_step_version);
    v_outcome:='rejection';
    v_decision_text:=format('قرر المجلس عدم الموافقة على «%s» وإنهاء مساره.',v_topic_title);
  end if;
  v_decision_id:=qarar_decisions.record_rejected_vote_resolution_decision(v_round.id,v_outcome,v_decision_text);
  update qarar_voting.rejected_vote_resolutions set status='resolved',resolution=p_resolution,
    reason=case when p_resolution='return_previous' then btrim(p_reason) end,
    resolved_by_user_id=v_actor,resolved_at=clock_timestamp(),idempotency_key=p_idempotency_key,
    action_version=action_version+1,updated_at=clock_timestamp()
  where id=v_resolution.id;
  perform qarar_audit.append_audit_log(v_org,'voting.rejection_resolved','voting_rounds',v_round.id,
    jsonb_build_object('resolution',p_resolution,'reason',case when p_resolution='return_previous' then btrim(p_reason) end,
      'decision_id',v_decision_id,'destination',v_destination,'idempotency_key',p_idempotency_key));
  return jsonb_build_object('resolution_id',v_resolution.id,'decision_id',v_decision_id,
    'resolution',p_resolution,'idempotent_replay',false);
end;
$$;

create function qarar_voting.block_session_end_with_pending_rejection()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.status='waiting_for_minutes' and old.status='in_progress' and exists(
    select 1 from qarar_voting.rejected_vote_resolutions r
    where r.meeting_id=new.id and r.organization_id=new.organization_id and r.status='pending'
  ) then
    raise exception using errcode='55000',message='احسم نتيجة الرفض لكل بند قبل إنهاء الجلسة.';
  end if;
  return new;
end;
$$;
create trigger meetings_pending_rejection_guard before update of status on qarar_meetings.meetings
for each row execute function qarar_voting.block_session_end_with_pending_rejection();

alter function qarar_voting.list_pending_rejected_vote_resolutions(uuid) owner to qarar_voting_executor;
alter function qarar_voting.resolve_rejected_vote(uuid,text,text,uuid,integer) owner to qarar_voting_executor;
alter function qarar_voting.block_session_end_with_pending_rejection() owner to qarar_voting_executor;
revoke all on function qarar_voting.list_pending_rejected_vote_resolutions(uuid),qarar_voting.resolve_rejected_vote(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_voting.list_pending_rejected_vote_resolutions(uuid),qarar_voting.resolve_rejected_vote(uuid,text,text,uuid,integer) to qarar_api_executor;
grant execute on function qarar_governance.return_topic_to_previous_council(uuid,text,uuid,integer) to qarar_voting_executor;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) to qarar_voting_executor;
grant execute on function qarar_iam.has_unit_role_code(uuid,text[]) to qarar_voting_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('voting','qarar_governance','return_topic_to_previous_council','p_topic_id uuid, p_reason text, p_idempotency_key uuid, p_expected_version integer','Apply the unified cross-council return only after a verified rejected vote'),
('voting','qarar_governance','act_topic_workflow_step','p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer','End a governed route after the contextual chair confirms the rejected result'),
('voting','qarar_iam','has_unit_role_code','target_unit_id uuid, role_codes text[]','Expose the rejected-vote choice only to the contextual chair')
on conflict do nothing;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('rejected_vote_resolutions','voting',false) on conflict do nothing;

create function api_v1.list_pending_rejected_vote_resolutions(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_voting.list_pending_rejected_vote_resolutions($1)$$;
create function api_v1.resolve_rejected_vote(
  p_voting_round_id uuid,p_resolution text,p_reason text,p_idempotency_key uuid,p_expected_version integer
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_voting.resolve_rejected_vote($1,$2,$3,$4,$5)$$;
alter function api_v1.list_pending_rejected_vote_resolutions(uuid) owner to qarar_api_executor;
alter function api_v1.resolve_rejected_vote(uuid,text,text,uuid,integer) owner to qarar_api_executor;
revoke all on function api_v1.list_pending_rejected_vote_resolutions(uuid),api_v1.resolve_rejected_vote(uuid,text,text,uuid,integer) from public,anon;
grant execute on function api_v1.list_pending_rejected_vote_resolutions(uuid),api_v1.resolve_rejected_vote(uuid,text,text,uuid,integer) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','list_pending_rejected_vote_resolutions','qarar_voting','list_pending_rejected_vote_resolutions','p_meeting_id uuid','voting','authenticated'),
('v1','resolve_rejected_vote','qarar_voting','resolve_rejected_vote','p_voting_round_id uuid, p_resolution text, p_reason text, p_idempotency_key uuid, p_expected_version integer','voting','authenticated')
on conflict do nothing;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'voting',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='qarar_voting' and p.proname in ('list_pending_rejected_vote_resolutions','resolve_rejected_vote','block_session_end_with_pending_rejection'))
on conflict do nothing;

notify pgrst,'reload schema';
commit;
