grant execute on function qarar_iam.is_system_admin()
  to qarar_governance_executor;

grant execute on function qarar_iam.current_organization_id(),
  qarar_iam.assert_permission(text, uuid)
to qarar_minutes_executor;

grant execute on function qarar_minutes.sign_meeting_minutes_approval(
  uuid, jsonb, timestamp with time zone
) to qarar_api_executor;
