begin;

-- Minutes functions are SECURITY DEFINER under the isolated minutes executor.
-- Grant only the cross-module dependencies needed to assemble and audit minutes.
set local role qarar_iam_executor;
grant execute on function qarar_iam.current_organization_id(),
  qarar_iam.is_system_admin()
to qarar_minutes_executor;
reset role;

set local role qarar_audit_executor;
grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)
to qarar_minutes_executor;
reset role;

grant usage on schema qarar_topics,qarar_audit
to qarar_minutes_executor;

grant select on qarar_meetings.agenda_items,
  qarar_iam.users,
  qarar_topics.topics
to qarar_minutes_executor;

commit;
