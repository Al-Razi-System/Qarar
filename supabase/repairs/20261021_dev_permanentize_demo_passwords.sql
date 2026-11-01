-- DEVELOPMENT ONLY.
-- Makes the current passwords of demo-organization users permanent without
-- reading, replacing, or copying plaintext credentials. Never run in production.
begin;

select set_config('request.jwt.claim.sub', 'cbc2ce76-c112-4048-9ede-7d7f219758eb', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"cbc2ce76-c112-4048-9ede-7d7f219758eb","role":"authenticated"}',
  true
);

do $$
declare
  v_organization_id constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor_id constant uuid := 'cbc2ce76-c112-4048-9ede-7d7f219758eb';
  v_source constant text := '20261021_dev_permanentize_demo_passwords';
  v_target_count integer;
  v_revoked_auth_sessions integer := 0;
  v_revoked_qarar_sessions integer := 0;
  v_user record;
begin
  if not exists (
    select 1
    from qarar_iam.users
    where id = v_actor_id
      and organization_id = v_organization_id
      and status = 'active'
      and is_system_admin
      and not must_change_password
  ) then
    raise exception 'Development repair actor unavailable';
  end if;

  if exists (
    select 1
    from qarar_iam.users u
    left join auth.users au on au.id = u.id
    where u.organization_id = v_organization_id
      and u.must_change_password
      and (
        u.status <> 'active'
        or au.id is null
        or au.encrypted_password is null
        or au.encrypted_password = ''
        or au.encrypted_password is distinct from u.temporary_password_hash
      )
  ) then
    raise exception 'Temporary-password target failed the preservation precondition';
  end if;

  create temporary table dev_password_repair_targets on commit drop as
  select u.id, u.organization_id
  from qarar_iam.users u
  where u.organization_id = v_organization_id
    and u.must_change_password;

  select count(*) into v_target_count from dev_password_repair_targets;

  -- Lock the selected user rows so the target set cannot change mid-repair.
  perform 1
  from qarar_iam.users u
  join dev_password_repair_targets t on t.id = u.id
  for update of u;

  delete from auth.sessions s
  using dev_password_repair_targets t
  where s.user_id = t.id;
  get diagnostics v_revoked_auth_sessions = row_count;

  update qarar_iam.user_sessions us
  set revoked_at = coalesce(us.revoked_at, clock_timestamp()),
      revocation_reason = coalesce(
        us.revocation_reason,
        'development temporary password permanentized'
      )
  from dev_password_repair_targets t
  where us.user_id = t.id
    and us.revoked_at is null;
  get diagnostics v_revoked_qarar_sessions = row_count;

  for v_user in
    update qarar_iam.users u
    set must_change_password = false,
        require_live_auth_session = true,
        temporary_password_hash = null,
        password_change_claim = null,
        password_change_claim_until = null,
        password_change_receipt = null,
        updated_at = clock_timestamp()
    from dev_password_repair_targets t
    where u.id = t.id
      and u.organization_id = t.organization_id
      and u.must_change_password
    returning u.id, u.organization_id
  loop
    perform qarar_audit.append_audit_log(
      v_user.organization_id,
      'iam.temporary_password.permanentized_by_dev_repair',
      'users',
      v_user.id,
      jsonb_build_object(
        'source', v_source,
        'current_password_preserved', true,
        'old_sessions_revoked', true
      )
    );
  end loop;

  if (
    select count(*)
    from qarar_iam.users u
    join dev_password_repair_targets t on t.id = u.id
    where not u.must_change_password
      and u.temporary_password_hash is null
      and u.password_change_claim is null
      and u.password_change_claim_until is null
  ) <> v_target_count then
    raise exception 'Development password repair verification failed';
  end if;

  raise notice
    'Permanentized % demo passwords; revoked % Auth sessions and % Qarar sessions',
    v_target_count,
    v_revoked_auth_sessions,
    v_revoked_qarar_sessions;
end;
$$;

commit;
