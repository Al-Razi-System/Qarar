-- Four-eyes user offboarding: request, independent review, and atomic execution.
create table if not exists qarar_iam.user_offboarding_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  target_user_id uuid not null,
  successor_user_id uuid,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','rejected','applied','failed')),
  requested_by_user_id uuid not null,
  reviewed_by_user_id uuid,
  review_notes text,
  reviewed_at timestamptz,
  applied_at timestamptz,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (target_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (successor_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (requested_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (reviewed_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (target_user_id <> requested_by_user_id),
  check (successor_user_id is null or successor_user_id <> target_user_id),
  check (reviewed_by_user_id is null or reviewed_by_user_id <> requested_by_user_id)
);

create unique index if not exists user_offboarding_one_pending_target_idx
  on qarar_iam.user_offboarding_requests(organization_id,target_user_id) where status='pending';
create index if not exists user_offboarding_review_queue_idx
  on qarar_iam.user_offboarding_requests(organization_id,created_at) where status='pending';

alter table qarar_iam.user_offboarding_requests enable row level security;
alter table qarar_iam.user_offboarding_requests owner to qarar_iam_executor;
revoke all on table qarar_iam.user_offboarding_requests from public,anon,authenticated,service_role;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('user_offboarding_requests','iam',false) on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

create or replace function qarar_execution.reassign_user_open_tasks(
  p_organization_id uuid,p_target_user_id uuid,p_successor_user_id uuid,p_apply boolean
) returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_count integer;
begin
  select count(*)::integer into v_count from qarar_execution.action_items
  where organization_id=p_organization_id and status in ('new','in_progress','overdue')
    and (assigned_user_id=p_target_user_id or follow_up_user_id=p_target_user_id);
  if p_apply and v_count>0 then
    if p_successor_user_id is null then raise exception 'successor is required for open task ownership' using errcode='23514'; end if;
    update qarar_execution.action_items set
      assigned_user_id=case when assigned_user_id=p_target_user_id then p_successor_user_id else assigned_user_id end,
      follow_up_user_id=case when follow_up_user_id=p_target_user_id then p_successor_user_id else follow_up_user_id end,
      updated_at=now()
    where organization_id=p_organization_id and status in ('new','in_progress','overdue')
      and (assigned_user_id=p_target_user_id or follow_up_user_id=p_target_user_id);
  end if;
  return v_count;
end $$;
alter function qarar_execution.reassign_user_open_tasks(uuid,uuid,uuid,boolean) owner to qarar_execution_executor;
revoke all on function qarar_execution.reassign_user_open_tasks(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant usage on schema qarar_execution to qarar_iam_executor;
grant execute on function qarar_execution.reassign_user_open_tasks(uuid,uuid,uuid,boolean) to qarar_iam_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('iam','qarar_execution','reassign_user_open_tasks','p_organization_id uuid, p_target_user_id uuid, p_successor_user_id uuid, p_apply boolean','Atomically transfer open task ownership during governed offboarding')
on conflict do nothing;

create or replace function qarar_iam.admin_request_user_offboarding(
  p_target_user_id uuid,p_successor_user_id uuid,p_justification text
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_id uuid;
begin
  perform qarar_iam.assert_permission('iam.users.manage');
  if p_target_user_id=auth.uid() then raise exception 'requester cannot offboard their own account' using errcode='42501'; end if;
  if nullif(btrim(p_justification),'') is null then raise exception 'justification is required'; end if;
  if not exists(select 1 from qarar_iam.users where id=p_target_user_id and organization_id=v_org and status='active') then raise exception 'active target user not found'; end if;
  if p_successor_user_id is not null and not exists(select 1 from qarar_iam.users where id=p_successor_user_id and organization_id=v_org and status='active') then raise exception 'active successor not found'; end if;
  if qarar_execution.reassign_user_open_tasks(v_org,p_target_user_id,p_successor_user_id,false)>0 and p_successor_user_id is null then
    raise exception 'successor is required for open task ownership' using errcode='23514';
  end if;
  insert into qarar_iam.user_offboarding_requests(organization_id,target_user_id,successor_user_id,justification,requested_by_user_id)
  values(v_org,p_target_user_id,p_successor_user_id,btrim(p_justification),auth.uid()) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'iam.offboarding.requested','user_offboarding_requests',v_id,jsonb_build_object('target_user_id',p_target_user_id,'successor_user_id',p_successor_user_id));
  return v_id;
end $$;

create or replace function qarar_iam.admin_review_user_offboarding(
  p_request_id uuid,p_decision text,p_notes text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_req qarar_iam.user_offboarding_requests%rowtype;
 v_memberships int:=0; v_delegations int:=0; v_tasks int:=0; v_auth_sessions int:=0; v_app_sessions int:=0;
 v_target_system boolean; v_actor_system boolean;
begin
  perform qarar_iam.assert_permission('iam.users.manage');
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected'; end if;
  select * into v_req from qarar_iam.user_offboarding_requests where id=p_request_id and organization_id=v_org and status='pending' for update;
  if not found then raise exception 'pending offboarding request not found'; end if;
  if v_req.requested_by_user_id=auth.uid() then raise exception 'requester cannot approve their own request' using errcode='42501'; end if;
  if p_decision='rejected' then
    update qarar_iam.user_offboarding_requests set status='rejected',reviewed_by_user_id=auth.uid(),reviewed_at=now(),review_notes=p_notes,updated_at=now() where id=v_req.id;
    perform qarar_audit.append_audit_log(v_org,'iam.offboarding.rejected','user_offboarding_requests',v_req.id,jsonb_build_object('correlation_id',v_req.correlation_id,'target_user_id',v_req.target_user_id));
    return jsonb_build_object('request_id',v_req.id,'status','rejected','correlation_id',v_req.correlation_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text,2026081613));
  select is_system_admin into v_target_system from qarar_iam.users where id=v_req.target_user_id and organization_id=v_org for update;
  select is_system_admin into v_actor_system from qarar_iam.users where id=auth.uid() and organization_id=v_org and status='active';
  if v_target_system and not coalesce(v_actor_system,false) then raise exception 'only a system administrator may approve system administrator offboarding' using errcode='42501'; end if;
  if v_target_system and not exists(select 1 from qarar_iam.users where organization_id=v_org and id<>v_req.target_user_id and is_system_admin and status='active') then raise exception 'at least one active system administrator is required' using errcode='23514'; end if;
  if v_req.successor_user_id is not null and not exists(select 1 from qarar_iam.users where id=v_req.successor_user_id and organization_id=v_org and status='active' for update) then raise exception 'active successor not found'; end if;

  v_tasks:=qarar_execution.reassign_user_open_tasks(v_org,v_req.target_user_id,v_req.successor_user_id,true);

  update qarar_iam.memberships set membership_status='ended',end_date=least(coalesce(end_date,current_date),current_date),updated_at=now()
  where organization_id=v_org and user_id=v_req.target_user_id and membership_status='active'; get diagnostics v_memberships=row_count;
  update qarar_iam.access_delegations set status='revoked',revoked_at=now(),revoked_by_user_id=auth.uid(),updated_at=now(),reason=reason||E'\nRevoked by offboarding '||v_req.correlation_id::text
  where organization_id=v_org and status='active' and (delegated_by_user_id=v_req.target_user_id or delegated_to_user_id=v_req.target_user_id); get diagnostics v_delegations=row_count;
  delete from auth.sessions where user_id=v_req.target_user_id; get diagnostics v_auth_sessions=row_count;
  update qarar_iam.user_sessions set revoked_at=coalesce(revoked_at,now()),revocation_reason='offboarding:'||v_req.correlation_id::text where organization_id=v_org and user_id=v_req.target_user_id and revoked_at is null; get diagnostics v_app_sessions=row_count;
  update qarar_iam.users set status='inactive',updated_at=now() where id=v_req.target_user_id and organization_id=v_org;
  update qarar_iam.user_offboarding_requests set status='applied',reviewed_by_user_id=auth.uid(),reviewed_at=now(),review_notes=p_notes,applied_at=now(),updated_at=now() where id=v_req.id;
  perform qarar_audit.append_audit_log(v_org,'iam.offboarding.applied','user_offboarding_requests',v_req.id,jsonb_build_object('correlation_id',v_req.correlation_id,'target_user_id',v_req.target_user_id,'successor_user_id',v_req.successor_user_id,'memberships_ended',v_memberships,'delegations_revoked',v_delegations,'tasks_reassigned',v_tasks,'auth_sessions_revoked',v_auth_sessions,'app_sessions_revoked',v_app_sessions));
  return jsonb_build_object('request_id',v_req.id,'status','applied','correlation_id',v_req.correlation_id,'memberships_ended',v_memberships,'delegations_revoked',v_delegations,'tasks_reassigned',v_tasks,'auth_sessions_revoked',v_auth_sessions,'app_sessions_revoked',v_app_sessions);
end $$;

create or replace function qarar_iam.admin_list_iam_approval_requests(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('iam.permissions.read');
  return jsonb_build_object(
    'iam_changes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.change_type,'status',r.status,'justification',r.justification,'requested_by_user_id',r.requested_by_user_id,'reviewed_by_user_id',r.reviewed_by_user_id,'created_at',r.created_at) order by r.created_at desc) from qarar_iam.iam_change_requests r where r.organization_id=v_org and (p_status is null or r.status=p_status)),'[]'::jsonb),
    'offboarding',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'target_user_id',r.target_user_id,'successor_user_id',r.successor_user_id,'justification',r.justification,'requested_by_user_id',r.requested_by_user_id,'reviewed_by_user_id',r.reviewed_by_user_id,'correlation_id',r.correlation_id,'created_at',r.created_at) order by r.created_at desc) from qarar_iam.user_offboarding_requests r where r.organization_id=v_org and (p_status is null or r.status=p_status)),'[]'::jsonb)
  );
end $$;

alter function qarar_iam.admin_request_user_offboarding(uuid,uuid,text) owner to qarar_iam_executor;
alter function qarar_iam.admin_review_user_offboarding(uuid,text,text) owner to qarar_iam_executor;
alter function qarar_iam.admin_list_iam_approval_requests(text) owner to qarar_iam_executor;
revoke all on function qarar_iam.admin_request_user_offboarding(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.admin_review_user_offboarding(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.admin_list_iam_approval_requests(text) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.admin_request_user_offboarding(uuid,uuid,text),qarar_iam.admin_review_user_offboarding(uuid,text,text),qarar_iam.admin_list_iam_approval_requests(text) to qarar_api_executor;

create or replace function api_v1.admin_request_user_offboarding(p_target_user_id uuid,p_successor_user_id uuid,p_justification text) returns uuid language sql security definer set search_path=pg_catalog as $$select qarar_iam.admin_request_user_offboarding(p_target_user_id,p_successor_user_id,p_justification)$$;
create or replace function api_v1.admin_review_user_offboarding(p_request_id uuid,p_decision text,p_notes text) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.admin_review_user_offboarding(p_request_id,p_decision,p_notes)$$;
create or replace function api_v1.admin_list_iam_approval_requests(p_status text default 'pending') returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.admin_list_iam_approval_requests(p_status)$$;
alter function api_v1.admin_request_user_offboarding(uuid,uuid,text) owner to qarar_api_executor;
alter function api_v1.admin_review_user_offboarding(uuid,text,text) owner to qarar_api_executor;
alter function api_v1.admin_list_iam_approval_requests(text) owner to qarar_api_executor;
revoke all on function api_v1.admin_request_user_offboarding(uuid,uuid,text),api_v1.admin_review_user_offboarding(uuid,text,text),api_v1.admin_list_iam_approval_requests(text) from public,anon,service_role;
grant execute on function api_v1.admin_request_user_offboarding(uuid,uuid,text),api_v1.admin_review_user_offboarding(uuid,text,text),api_v1.admin_list_iam_approval_requests(text) to authenticated;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','admin_request_user_offboarding','qarar_iam','admin_request_user_offboarding','p_target_user_id uuid, p_successor_user_id uuid, p_justification text','iam','authenticated'),
('v1','admin_review_user_offboarding','qarar_iam','admin_review_user_offboarding','p_request_id uuid, p_decision text, p_notes text','iam','authenticated'),
('v1','admin_list_iam_approval_requests','qarar_iam','admin_list_iam_approval_requests','p_status text','iam','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
update qarar_architecture.api_release_registry release set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),
 released_at=clock_timestamp() where release.api_version='v1';
do $$begin if (select contract_count from qarar_architecture.api_release_registry where api_version='v1')<>200 then raise exception 'expected 200 api contracts after offboarding'; end if; end$$;
select pg_notify('pgrst','reload schema');
