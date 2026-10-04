-- Repair the workflow wrapper used by the voting trigger. A previous wrapper
-- rejected meeting-owned steps before delegating, while the guarded helper
-- accidentally delegated to itself. Keep the public guard and let only a
-- trusted voting transition reach the existing transactional core.
create or replace function qarar_governance.act_topic_workflow_step_guarded_core(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_topic qarar_topics.topics%rowtype;
  v_step record;
  v_is_voting_transition boolean;
begin
  select * into v_topic
  from qarar_topics.topics
  where id = p_topic_id
    and organization_id = qarar_iam.current_organization_id();

  if v_topic.id is null then
    raise exception using errcode = 'P0002', message = 'الموضوع غير موجود';
  end if;

  select s.id, s.status, ts.step_type, ts.responsibility
  into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id = s.template_step_id
  where s.id = v_topic.current_workflow_step_id
    and s.workflow_instance_id = v_topic.workflow_instance_id;

  if v_step.id is null or v_step.status <> 'active' then
    raise exception using errcode = '55000', message = 'لا توجد خطوة حوكمة نشطة للموضوع';
  end if;

  v_is_voting_transition :=
    coalesce(current_setting('qarar.voting_transition', true), '') = 'on'
    and nullif(current_setting('qarar.voting_round_id', true), '') is not null;

  if v_step.step_type = 'voting'
     or v_step.responsibility in ('initial_approve', 'final_approve') then
    if not v_is_voting_transition then
      raise exception using errcode = '55000', message = 'خطوة التصويت تُنفذ حصراً عبر جولة تصويت الاجتماع';
    end if;
  elsif v_step.step_type = 'discussion'
     or v_step.responsibility in ('present', 'discuss', 'recommend') then
    raise exception using errcode = '55000', message = 'هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;

  return qarar_governance.act_topic_workflow_step_core(
    p_topic_id,
    p_outcome_code,
    p_comment,
    p_idempotency_key,
    p_expected_version
  );
end;
$$;

create or replace function qarar_governance.act_topic_workflow_step(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  v_result := qarar_governance.act_topic_workflow_step_guarded_core(
    p_topic_id,
    p_outcome_code,
    p_comment,
    p_idempotency_key,
    p_expected_version
  );

  return v_result || jsonb_build_object(
    'topic_status', (select status from qarar_topics.topics where id = p_topic_id)
  );
end;
$$;

alter function qarar_governance.act_topic_workflow_step_guarded_core(uuid,text,text,uuid,integer)
  owner to qarar_governance_executor;
alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  owner to qarar_governance_executor;

revoke all on function qarar_governance.act_topic_workflow_step_guarded_core(uuid,text,text,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.act_topic_workflow_step_guarded_core(uuid,text,text,uuid,integer)
  to qarar_governance_executor;
