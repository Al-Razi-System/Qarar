begin;

-- A historical snapshot retained two topic routing IDs after their matching
-- decision rows had been removed.  Preserve the original IDs in the governed
-- audit trail, then clear only the invalid foreign-key reference.  The topic,
-- its approved policy and its active workflow remain unchanged.
with orphaned_topics as (
  select t.id, t.organization_id, t.topic_no, t.routing_decision_id,
         t.routing_status, t.updated_at
  from qarar_topics.topics t
  left join qarar_governance.regulation_match_decisions d
    on d.id = t.routing_decision_id
   and d.organization_id = t.organization_id
  where t.routing_decision_id is not null
    and d.id is null
)
insert into qarar_audit.audit_logs(
  organization_id, actor_user_id, action, entity_type, entity_id, result,
  previous_data, new_data, metadata
)
select
  organization_id,
  null,
  'repair_orphan_topic_routing_reference',
  'topic',
  id,
  'success',
  jsonb_build_object(
    'topic_no', topic_no,
    'routing_decision_id', routing_decision_id,
    'routing_status', routing_status,
    'updated_at', updated_at
  ),
  jsonb_build_object(
    'routing_decision_id', null,
    'routing_status', routing_status
  ),
  jsonb_build_object(
    'reason', 'Referenced regulation_match_decision no longer exists',
    'repair_migration', '20260830010000'
  )
from orphaned_topics
where not exists (
  select 1
  from qarar_audit.audit_logs audit
  where audit.action = 'repair_orphan_topic_routing_reference'
    and audit.entity_type = 'topic'
    and audit.entity_id = orphaned_topics.id
    and audit.metadata ->> 'repair_migration' = '20260830010000'
);

update qarar_topics.topics t
set routing_decision_id = null
where t.routing_decision_id is not null
  and not exists (
    select 1
    from qarar_governance.regulation_match_decisions d
    where d.id = t.routing_decision_id
      and d.organization_id = t.organization_id
  );

commit;
