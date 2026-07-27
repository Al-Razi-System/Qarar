begin;

create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare
 replay qarar_governance.workflow_instance_steps%rowtype;
 next_template_step_id uuid;
 next_step_id uuid;
 replay_workflow_status text;
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
   select t.to_step_id into next_template_step_id
   from qarar_governance.workflow_instances i
   join qarar_governance.workflow_template_transitions t
     on t.workflow_template_version_id=i.workflow_template_version_id
    and t.from_step_id=replay.template_step_id
    and t.outcome_code=replay.outcome_code
   where i.id=replay.workflow_instance_id;

   if next_template_step_id is not null then
     select id into next_step_id
     from qarar_governance.workflow_instance_steps
     where workflow_instance_id=replay.workflow_instance_id
       and template_step_id=next_template_step_id;
     replay_workflow_status:='active';
   else
     replay_workflow_status:=case when replay.outcome_code='rejected' then 'rejected' else 'completed' end;
   end if;

   return jsonb_build_object(
     'topic_id',p_topic_id,
     'completed_step_id',replay.id,
     'next_step_id',next_step_id,
     'workflow_status',replay_workflow_status,
     'version',replay.action_version,
     'idempotent_replay',true
   );
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
