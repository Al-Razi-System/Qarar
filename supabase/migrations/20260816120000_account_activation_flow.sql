-- One-time, time-limited account activation with an atomic claim/finalize flow.

alter table qarar_iam.user_invitations
  add column if not exists auth_user_id uuid,
  add column if not exists activation_claim_hash text,
  add column if not exists activation_claimed_at timestamptz;

alter table qarar_iam.user_invitations
  drop constraint if exists user_invitations_invitation_status_check;
alter table qarar_iam.user_invitations
  add constraint user_invitations_invitation_status_check
  check (invitation_status in ('pending','activating','accepted','revoked','expired'));

create unique index if not exists uq_user_invitations_auth_user
  on qarar_iam.user_invitations(auth_user_id)
  where auth_user_id is not null and invitation_status in ('pending','activating');

create or replace function qarar_iam.service_issue_activation_invitation(
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_full_name_ar text,
  p_role_id uuid,
  p_governance_unit_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,auth,qarar_core,qarar_iam,qarar_audit as $$
declare v_org uuid; v_id uuid; v_email text:=lower(btrim(p_email));
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if not qarar_iam.actor_has_permission(p_actor_user_id,'iam.users.manage',null) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  select organization_id into v_org from qarar_iam.users
  where id=p_auth_user_id and lower(email)=v_email;
  if v_org is null then raise exception 'managed user not found' using errcode='P0002'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at<=clock_timestamp()
     or p_expires_at>clock_timestamp()+interval '8 days' then
    raise exception 'invalid activation token metadata' using errcode='22023';
  end if;
  update qarar_iam.user_invitations set invitation_status='revoked',revoked_at=clock_timestamp()
   where organization_id=v_org and email=v_email and invitation_status in('pending','activating');
  insert into qarar_iam.user_invitations(
    organization_id,email,full_name_ar,role_id,governance_unit_id,
    invited_by_user_id,auth_user_id,token_hash,expires_at
  ) values(v_org,v_email,nullif(btrim(p_full_name_ar),''),p_role_id,p_governance_unit_id,
    p_actor_user_id,p_auth_user_id,p_token_hash,p_expires_at) returning id into v_id;
  update qarar_iam.users set status='inactive' where id=p_auth_user_id and organization_id=v_org;
  perform qarar_audit.append_audit_log(v_org,'iam.activation.invitation.issued','user_invitations',v_id,
    jsonb_build_object('auth_user_id',p_auth_user_id,'expires_at',p_expires_at));
  return jsonb_build_object('invitation_id',v_id,'expires_at',p_expires_at);
end $$;

create or replace function qarar_iam.service_preview_activation(p_token_hash text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,auth,qarar_core,qarar_iam as $$
declare r record;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  update qarar_iam.user_invitations set invitation_status='expired'
   where token_hash=p_token_hash and invitation_status in('pending','activating') and expires_at<=clock_timestamp();
  select i.id,i.email,i.full_name_ar,i.expires_at,o.name_ar organization_name
    into r from qarar_iam.user_invitations i join qarar_core.organizations o on o.id=i.organization_id
   where i.token_hash=p_token_hash and i.invitation_status='pending' and i.expires_at>clock_timestamp();
  if r.id is null then raise exception 'activation invitation is invalid' using errcode='P0002'; end if;
  return jsonb_build_object('invitation_id',r.id,'email',r.email,'full_name_ar',r.full_name_ar,
    'organization_name',r.organization_name,'expires_at',r.expires_at);
end $$;

create or replace function qarar_iam.service_claim_activation(p_token_hash text,p_claim_hash text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,auth,qarar_iam as $$
declare r qarar_iam.user_invitations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_claim_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid claim' using errcode='22023'; end if;
  update qarar_iam.user_invitations set invitation_status='activating',activation_claim_hash=p_claim_hash,
    activation_claimed_at=clock_timestamp()
   where token_hash=p_token_hash and invitation_status='pending' and expires_at>clock_timestamp()
   returning * into r;
  if r.id is null then
    select * into r from qarar_iam.user_invitations where token_hash=p_token_hash
      and invitation_status='activating' and activation_claim_hash=p_claim_hash and expires_at>clock_timestamp();
  end if;
  if r.id is null then raise exception 'activation invitation is invalid or already used' using errcode='P0002'; end if;
  return jsonb_build_object('invitation_id',r.id,'auth_user_id',r.auth_user_id,'email',r.email);
end $$;

create or replace function qarar_iam.service_finish_activation(
  p_invitation_id uuid,p_auth_user_id uuid,p_claim_hash text,p_success boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,auth,qarar_iam,qarar_audit as $$
declare r qarar_iam.user_invitations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into r from qarar_iam.user_invitations where id=p_invitation_id for update;
  if r.id is null or r.auth_user_id is distinct from p_auth_user_id or r.invitation_status<>'activating'
     or r.activation_claim_hash is distinct from p_claim_hash then
    raise exception 'activation claim is invalid' using errcode='P0002';
  end if;
  if not p_success then
    update qarar_iam.user_invitations set invitation_status='pending',activation_claim_hash=null,
      activation_claimed_at=null where id=r.id;
    return jsonb_build_object('released',true);
  end if;
  update qarar_iam.users set status='active' where id=p_auth_user_id and organization_id=r.organization_id;
  update qarar_iam.user_invitations set invitation_status='accepted',accepted_by_user_id=p_auth_user_id,
    accepted_at=clock_timestamp(),token_hash=null,activation_claim_hash=null,activation_claimed_at=null where id=r.id;
  perform qarar_audit.append_audit_log(r.organization_id,'iam.account.activated','user_invitations',r.id,
    jsonb_build_object('auth_user_id',p_auth_user_id));
  return jsonb_build_object('activated',true,'user_id',p_auth_user_id);
end $$;

alter function qarar_iam.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz) owner to qarar_iam_executor;
alter function qarar_iam.service_preview_activation(text) owner to qarar_iam_executor;
alter function qarar_iam.service_claim_activation(text,text) owner to qarar_iam_executor;
alter function qarar_iam.service_finish_activation(uuid,uuid,text,boolean) owner to qarar_iam_executor;
revoke all on function qarar_iam.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.service_preview_activation(text) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.service_claim_activation(text,text) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.service_finish_activation(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz),
 qarar_iam.service_preview_activation(text),qarar_iam.service_claim_activation(text,text),
 qarar_iam.service_finish_activation(uuid,uuid,text,boolean) to qarar_api_executor;

create or replace function api_v1.service_issue_activation_invitation(p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,p_role_id uuid,p_governance_unit_id uuid,p_token_hash text,p_expires_at timestamptz) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_issue_activation_invitation($1,$2,$3,$4,$5,$6,$7,$8)$$;
create or replace function api_v1.service_preview_activation(p_token_hash text) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_preview_activation($1)$$;
create or replace function api_v1.service_claim_activation(p_token_hash text,p_claim_hash text) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_claim_activation($1,$2)$$;
create or replace function api_v1.service_finish_activation(p_invitation_id uuid,p_auth_user_id uuid,p_claim_hash text,p_success boolean) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_finish_activation($1,$2,$3,$4)$$;
alter function api_v1.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.service_preview_activation(text) owner to qarar_api_executor;
alter function api_v1.service_claim_activation(text,text) owner to qarar_api_executor;
alter function api_v1.service_finish_activation(uuid,uuid,text,boolean) owner to qarar_api_executor;
revoke all on function api_v1.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz),
 api_v1.service_preview_activation(text),api_v1.service_claim_activation(text,text),
 api_v1.service_finish_activation(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function api_v1.service_issue_activation_invitation(uuid,uuid,text,text,uuid,uuid,text,timestamptz),
 api_v1.service_preview_activation(text),api_v1.service_claim_activation(text,text),
 api_v1.service_finish_activation(uuid,uuid,text,boolean) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam' and p.proname in('service_issue_activation_invitation','service_preview_activation','service_claim_activation','service_finish_activation')
on conflict(function_oid) do update set identity_arguments=excluded.identity_arguments;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','service_issue_activation_invitation','qarar_iam','service_issue_activation_invitation','p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_role_id uuid, p_governance_unit_id uuid, p_token_hash text, p_expires_at timestamp with time zone','iam','service_role'),
('v1','service_preview_activation','qarar_iam','service_preview_activation','p_token_hash text','iam','service_role'),
('v1','service_claim_activation','qarar_iam','service_claim_activation','p_token_hash text, p_claim_hash text','iam','service_role'),
('v1','service_finish_activation','qarar_iam','service_finish_activation','p_invitation_id uuid, p_auth_user_id uuid, p_claim_hash text, p_success boolean','iam','service_role')
on conflict(api_version,contract_name,identity_arguments) do update set audience=excluded.audience;
update qarar_architecture.api_release_registry set contract_count=(select count(*) from qarar_architecture.api_contract_registry),
 contract_hash=(select md5(string_agg(contract_name||'('||identity_arguments||')->'||audience,E'\n' order by contract_name,identity_arguments)) from qarar_architecture.api_contract_registry),released_at=clock_timestamp()
where api_version='v1';
notify pgrst,'reload schema';
