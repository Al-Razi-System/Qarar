begin;

create or replace function qarar_voting.cancel_expired_workflow_voting_rounds(
  p_workflow_instance_step_id uuid,p_closed_at timestamptz
) returns integer language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare v_count integer;
begin
 update qarar_voting.voting_rounds set status='cancelled',result='cancelled',closed_at=p_closed_at,
   close_reason='temporary workflow route expired'
 where workflow_instance_step_id=p_workflow_instance_step_id and status='open';
 get diagnostics v_count=row_count;
 return v_count;
end $$;
alter function qarar_voting.cancel_expired_workflow_voting_rounds(uuid,timestamptz) owner to qarar_voting_executor;
revoke all on function qarar_voting.cancel_expired_workflow_voting_rounds(uuid,timestamptz) from public,anon,authenticated,service_role;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'voting','qarar_voting',false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_voting' and p.proname='cancel_expired_workflow_voting_rounds'
on conflict(function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('governance','qarar_voting','cancel_expired_workflow_voting_rounds','p_workflow_instance_step_id uuid, p_closed_at timestamp with time zone','Cancel an open governed vote when its temporary route expires')
on conflict do nothing;
grant usage on schema qarar_voting to qarar_governance_executor;
grant execute on function qarar_voting.cancel_expired_workflow_voting_rounds(uuid,timestamptz) to qarar_governance_executor;

create or replace function qarar_governance.normalize_voting_step_outcomes()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
begin
 if new.step_type='voting' then
   select array_agg(outcome order by array_position(array['approved','rejected','tie','no_vote'],outcome)) into new.allowed_outcomes from unnest(new.allowed_outcomes) outcome;
 end if;
 return new;
end $$;
drop trigger if exists workflow_template_steps_normalize_voting_outcomes on qarar_governance.workflow_template_steps;
create trigger workflow_template_steps_normalize_voting_outcomes before insert or update of step_type,allowed_outcomes on qarar_governance.workflow_template_steps for each row execute function qarar_governance.normalize_voting_step_outcomes();
update qarar_governance.workflow_template_steps set allowed_outcomes=(select array_agg(outcome order by array_position(array['approved','rejected','tie','no_vote'],outcome)) from unnest(allowed_outcomes) outcome) where step_type='voting';

delete from qarar_architecture.module_function_execute_allowlist
where source_module='voting' and target_schema='qarar_governance'
  and function_name='act_topic_workflow_step_core';
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('voting','qarar_governance','act_topic_workflow_step','p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer','Advance a governed voting step from the authoritative closed result')
on conflict do nothing;
revoke execute on function qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer) from qarar_voting_executor;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) to qarar_voting_executor;

create or replace function qarar_governance.expire_governance_exceptions(p_as_of timestamptz default now())
returns integer language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare e record;step_id uuid;instance_id uuid;count_expired integer:=0;
begin
 for e in update qarar_governance.governance_exceptions set status='expired'
   where status in('pending','approved') and valid_until<=p_as_of
   returning id,organization_id,topic_id,requested_source
 loop
   select wi.id,wi.current_step_id into instance_id,step_id
   from qarar_governance.workflow_instances wi join qarar_governance.topic_governance_mappings m on m.id=wi.topic_governance_mapping_id
   where wi.topic_id=e.topic_id and wi.organization_id=e.organization_id and wi.status='active'
     and (m.snapshot->>'exception_id')::uuid=e.id for update;
   if instance_id is null then continue; end if;
   perform qarar_voting.cancel_expired_workflow_voting_rounds(step_id,p_as_of);
   update qarar_governance.workflow_instance_steps set status='cancelled',comment='temporary route expired' where id=step_id and status='active';
   update qarar_governance.workflow_instances set status='expired',current_step_id=null,completed_at=p_as_of,snapshot=snapshot||jsonb_build_object('expired_at',p_as_of,'expired_step_id',step_id) where id=instance_id;
   perform qarar_topics.apply_governance_snapshot(e.topic_id,e.requested_source,'routing_expired',(select policy_id from qarar_topics.topics where id=e.topic_id),(select policy_version_id from qarar_topics.topics where id=e.topic_id),(select policy_item_id from qarar_topics.topics where id=e.topic_id),(select policy_scope_assignment_id from qarar_topics.topics where id=e.topic_id),(select workflow_template_version_id from qarar_governance.workflow_instances where id=instance_id),instance_id,null,(select routing_decision_id from qarar_topics.topics where id=e.topic_id));
   perform qarar_audit.append_audit_log(e.organization_id,'governance.exception.expire','governance_exceptions',e.id,jsonb_build_object('topic_id',e.topic_id,'workflow_instance_id',instance_id));
   count_expired:=count_expired+1;
 end loop;
 return count_expired;
end $$;

alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  rename to act_topic_workflow_step_core;
create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare replay qarar_governance.workflow_instance_steps%rowtype;result jsonb;
begin
 if p_idempotency_key is null then raise exception using errcode='22023',message='مفتاح التكرار مطلوب';end if;
 select s.* into replay from qarar_governance.workflow_instance_steps s join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
 where i.topic_id=p_topic_id and i.organization_id=qarar_iam.current_organization_id() and s.action_idempotency_key=p_idempotency_key;
 if replay.id is not null then
   return jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',replay.workflow_instance_id,'completed_step_id',replay.id,'outcome',replay.outcome_code,'version',replay.action_version,'idempotent_replay',true);
 end if;
 if exists(select 1 from qarar_governance.topic_governance_mappings m join qarar_governance.governance_exceptions e on (m.snapshot->>'exception_id')::uuid=e.id where m.topic_id=p_topic_id and m.organization_id=qarar_iam.current_organization_id() and (e.status='expired' or(e.status='approved' and e.valid_until<=now()))) then raise exception using errcode='55000',message='انتهت صلاحية المسار المؤقت؛ اطلب تجديده ثم المراجعة المستقلة';end if;
 return qarar_governance.act_topic_workflow_step_core(p_topic_id,p_outcome_code,p_comment,p_idempotency_key,p_expected_version);
end $$;
alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) to qarar_api_executor;
update qarar_architecture.function_registry set function_name='act_topic_workflow_step_core'
where function_oid='qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)'::regprocedure;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

-- Keep the public contract thin: replay is safe after expiry, while a new
-- action against an expired temporary route remains blocked.
create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare replay qarar_governance.workflow_instance_steps%rowtype;
begin
 if p_idempotency_key is null then
   raise exception using errcode='22023',message='idempotency key is required';
 end if;
 select s.* into replay
 from qarar_governance.workflow_instance_steps s
 join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
 where i.topic_id=p_topic_id
   and i.organization_id=qarar_iam.current_organization_id()
   and s.action_idempotency_key=p_idempotency_key;
 if replay.id is not null then
   return jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',replay.workflow_instance_id,
    'completed_step_id',replay.id,'outcome',replay.outcome_code,'version',replay.action_version,'idempotent_replay',true);
 end if;
 if exists(
   select 1
   from qarar_governance.topic_governance_mappings m
   join qarar_governance.governance_exceptions e on (m.snapshot->>'exception_id')::uuid=e.id
   where m.topic_id=p_topic_id
     and m.organization_id=qarar_iam.current_organization_id()
     and (e.status='expired' or (e.status='approved' and e.valid_until<=now()))
 ) then
   raise exception using errcode='55000',message='temporary route has expired; request renewal and independent review';
 end if;
 return qarar_governance.act_topic_workflow_step_core(
   p_topic_id,p_outcome_code,p_comment,p_idempotency_key,p_expected_version
 );
end $$;

commit;
