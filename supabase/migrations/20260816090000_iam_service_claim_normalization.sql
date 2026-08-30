-- Normalize the request-claim representations before an edge service wrapper
-- impersonates an application actor.  The database supports JSON claim GUCs
-- (singular and plural) as well as the legacy scalar sub/role GUCs; changing
-- only one representation leaves the effective identity implementation
-- dependent on the runtime image.

do $$
begin
  if to_regprocedure('qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer)') is null
     or to_regprocedure('qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)') is null
     or to_regprocedure('qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)') is null
  then
    raise exception 'IAM service claim normalization requires the established service and audit command surface';
  end if;
end;
$$;

create or replace function qarar_iam.service_consume_iam_rate_limit(
  p_actor_user_id uuid,
  p_operation text,
  p_limit integer default 10,
  p_window_seconds integer default 600
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_iam
as $$
declare
  v_previous_claim text;
  v_previous_claims text;
  v_previous_claim_sub text;
  v_previous_claim_role text;
  v_actor_claims text := jsonb_build_object(
    'sub', p_actor_user_id,
    'role', 'authenticated'
  )::text;
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from qarar_iam.users
    where id = p_actor_user_id
      and status = 'active'
  ) then
    raise exception 'active actor not found' using errcode = '42501';
  end if;

  v_previous_claim := current_setting('request.jwt.claim', true);
  v_previous_claims := current_setting('request.jwt.claims', true);
  v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
  v_previous_claim_role := current_setting('request.jwt.claim.role', true);

  perform set_config('request.jwt.claim', v_actor_claims, true);
  perform set_config('request.jwt.claims', v_actor_claims, true);
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    v_count := qarar_iam.consume_iam_rate_limit(
      p_operation,
      p_limit,
      p_window_seconds
    );
  exception when others then
    perform set_config('request.jwt.claim', coalesce(v_previous_claim, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_previous_claim_role, ''), true);
    raise;
  end;

  perform set_config('request.jwt.claim', coalesce(v_previous_claim, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_previous_claim_role, ''), true);

  return v_count;
end;
$$;

create or replace function qarar_iam.service_finalize_invited_user(
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_full_name_ar text,
  p_employee_no text default null,
  p_mobile text default null,
  p_job_title text default null,
  p_role_id uuid default null,
  p_governance_unit_id uuid default null,
  p_membership_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_iam
as $$
declare
  v_previous_claim text;
  v_previous_claims text;
  v_previous_claim_sub text;
  v_previous_claim_role text;
  v_actor_claims text := jsonb_build_object(
    'sub', p_actor_user_id,
    'role', 'authenticated'
  )::text;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not qarar_iam.actor_has_permission(
    p_actor_user_id,
    'iam.users.manage',
    null
  ) then
    raise exception 'permission denied: iam.users.manage' using errcode = '42501';
  end if;

  v_previous_claim := current_setting('request.jwt.claim', true);
  v_previous_claims := current_setting('request.jwt.claims', true);
  v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
  v_previous_claim_role := current_setting('request.jwt.claim.role', true);

  perform set_config('request.jwt.claim', v_actor_claims, true);
  perform set_config('request.jwt.claims', v_actor_claims, true);
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    v_result := qarar_iam.admin_finalize_invited_user(
      p_auth_user_id,
      p_email,
      p_full_name_ar,
      p_employee_no,
      p_mobile,
      p_job_title,
      p_role_id,
      p_governance_unit_id,
      p_membership_title
    );
  exception when others then
    perform set_config('request.jwt.claim', coalesce(v_previous_claim, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_previous_claim_role, ''), true);
    raise;
  end;

  perform set_config('request.jwt.claim', coalesce(v_previous_claim, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_previous_claim_role, ''), true);

  return v_result;
end;
$$;

-- Audit events must identify the same actor across current JSON and legacy
-- claim layouts.  auth.uid() is authoritative when the installed runtime
-- exposes it; auth.jwt() and the legacy scalar GUC complete the portability
-- fallback used by the migration runner.
create or replace function qarar_audit.append_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, qarar_audit
as $$
declare
  v_id uuid;
  v_actor_user_id uuid;
  v_actor_claim_sub text;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  v_actor_user_id := auth.uid();

  if v_actor_user_id is null then
    v_actor_claim_sub := coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      nullif(current_setting('request.jwt.claim.sub', true), '')
    );

    if v_actor_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_actor_user_id := v_actor_claim_sub::uuid;
    end if;
  end if;

  insert into qarar_audit.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    v_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer) is
  'Service-only rate-limit command: temporarily normalizes all supported JWT claim GUCs to the revalidated actor, then restores the caller context.';
comment on function qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text) is
  'Service-only invitation finalization: temporarily normalizes all supported JWT claim GUCs to the revalidated actor, then restores the caller context.';
comment on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) is
  'Appends an immutable tenant audit event and resolves the actor from auth.uid(), JSON JWT claims, or the legacy scalar JWT subject.';

notify pgrst, 'reload schema';
