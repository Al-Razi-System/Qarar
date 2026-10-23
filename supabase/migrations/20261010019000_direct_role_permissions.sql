begin;
create table qarar_iam.role_permission_save_receipts_v2 (
 organization_id uuid not null references qarar_core.organizations(id),
 request_id uuid not null,
 role_id uuid not null,
 actor_user_id uuid not null,
 request_input jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(organization_id,request_id),
 foreign key(role_id,organization_id) references qarar_iam.roles(id,organization_id),
 foreign key(actor_user_id,organization_id) references qarar_iam.users(id,organization_id)
);
alter table qarar_iam.role_permission_save_receipts_v2 enable row level security;
alter table qarar_iam.role_permission_save_receipts_v2 force row level security;
revoke all on qarar_iam.role_permission_save_receipts_v2 from public,anon,authenticated,service_role;
grant select,insert on qarar_iam.role_permission_save_receipts_v2 to qarar_iam_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('role_permission_save_receipts_v2','iam',false);

create function qarar_iam.set_role_permissions_direct_v2(
 p_role_id uuid,p_permission_codes text[],p_expected_permission_codes text[],p_request_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 o uuid := qarar_iam.current_organization_id();
 r qarar_iam.roles%rowtype;
 receipt qarar_iam.role_permission_save_receipts_v2%rowtype;
 desired text[]; expected text[]; previous text[]; superseded uuid[];
 payload jsonb; result jsonb;
begin
 if o is null or not coalesce(qarar_iam.is_system_admin(),false) then
  raise exception using errcode='42501',message='حفظ الصلاحيات مباشرة متاح لمسؤول النظام فقط';
 end if;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then
  raise exception using errcode='42501',message='أكمل التحقق الإضافي قبل تغيير الصلاحيات';
 end if;
 if p_role_id is null or p_request_id is null or p_permission_codes is null or p_expected_permission_codes is null
 or array_position(p_permission_codes,null) is not null or array_position(p_expected_permission_codes,null) is not null
 or cardinality(p_permission_codes)>1000 or cardinality(p_expected_permission_codes)>1000 or length(coalesce(p_reason,''))>2000 then
  raise exception using errcode='22023',message='بيانات حفظ الصلاحيات غير صالحة';
 end if;
 select coalesce(array_agg(c order by c),array[]::text[]) into desired from (select distinct unnest(p_permission_codes) c) x;
 select coalesce(array_agg(c order by c),array[]::text[]) into expected from (select distinct unnest(p_expected_permission_codes) c) x;
 payload:=jsonb_build_object('role_id',p_role_id,'desired',to_jsonb(desired),'expected',to_jsonb(expected),'reason',nullif(btrim(p_reason),''));
 perform qarar_iam.lock_iam_authority_boundary(o);
 select * into r from qarar_iam.roles where id=p_role_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='الدور غير موجود في مؤسستك'; end if;
 select * into receipt from qarar_iam.role_permission_save_receipts_v2 where organization_id=o and request_id=p_request_id;
 if found then
  if receipt.actor_user_id<>auth.uid() or receipt.request_input<>payload then
   raise exception using errcode='40001',message='استُخدم طلب الحفظ لبيانات أخرى؛ أعد تحميل الدور';
  end if;
  return receipt.result;
 end if;
 if not r.is_active then raise exception using errcode='23514',message='أعد تفعيل الدور قبل تغيير صلاحياته'; end if;
 select coalesce(array_agg(p.code order by p.code),array[]::text[]) into previous
 from qarar_iam.role_permissions rp join qarar_iam.permissions p on p.id=rp.permission_id and p.organization_id=rp.organization_id
 where rp.organization_id=o and rp.role_id=p_role_id and rp.is_active and p.is_active;
 if previous<>expected then raise exception using errcode='40001',message='تغيّرت صلاحيات الدور في صفحة أخرى؛ أعد تحميله قبل الحفظ'; end if;
 if exists(select 1 from unnest(desired) c where not exists(select 1 from qarar_iam.permissions p where p.organization_id=o and p.code=c and p.is_active)) then
  raise exception using errcode='22023',message='إحدى الصلاحيات غير متاحة؛ أعد تحميل الدليل';
 end if;
 if exists(select 1 from qarar_iam.permissions p where p.organization_id=o and p.code=any(desired)
 and ((p.context_scope='system' and r.role_scope<>'system') or (p.context_scope='organization' and r.role_scope not in ('organization','system')))) then
  raise exception using errcode='23514',message='صلاحيات المؤسسة لا تناسب دورًا محصورًا في مجالس محددة';
 end if;
 -- Old approval commands share the authority lock before locking their request.
 select coalesce(array_agg(id),array[]::uuid[]) into superseded from qarar_iam.iam_change_requests
 where organization_id=o and target_role_id=p_role_id and change_type='role_permissions_replace' and status='pending';
 update qarar_iam.iam_change_requests set status='rejected',reviewed_by_user_id=auth.uid(),reviewed_at=now(),
 review_notes='استُبدل الطلب بحفظ مباشر للصلاحيات من مسؤول النظام'
 where id=any(superseded) and organization_id=o;
 -- Preserve disabled historical definitions; replace only currently selectable grants.
 update qarar_iam.role_permissions rp set is_active=false
 from qarar_iam.permissions p where rp.organization_id=o and rp.role_id=p_role_id
 and p.id=rp.permission_id and p.organization_id=o and p.is_active and rp.is_active and not p.code=any(desired);
 insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,granted_by_user_id,is_active)
 select o,p_role_id,p.id,auth.uid(),true from qarar_iam.permissions p where p.organization_id=o and p.code=any(desired)
 on conflict(organization_id,role_id,permission_id) do update set is_active=true,granted_by_user_id=auth.uid(),granted_at=now(),updated_at=now();
 perform qarar_audit.append_audit_log(o,'iam.role_permissions.direct_save','roles',p_role_id,
 jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(desired),'request_id',p_request_id,'reason',nullif(btrim(p_reason),''),'superseded_requests',to_jsonb(superseded)));
 result:=jsonb_build_object('saved',true,'role_id',p_role_id,'permission_codes',to_jsonb(desired),'superseded_request_count',cardinality(superseded));
 insert into qarar_iam.role_permission_save_receipts_v2(organization_id,request_id,role_id,actor_user_id,request_input,result)
 values(o,p_request_id,p_role_id,auth.uid(),payload,result);
 return result;
end $$;
alter function qarar_iam.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) owner to qarar_iam_executor;
revoke all on function qarar_iam.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) to qarar_api_executor;
create function api_v2.set_role_permissions_direct_v2(p_role_id uuid,p_permission_codes text[],p_expected_permission_codes text[],p_request_id uuid,p_reason text default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.set_role_permissions_direct_v2($1,$2,$3,$4,$5)$$;
alter function api_v2.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) owner to qarar_api_executor;
revoke all on function api_v2.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) from public,anon,service_role;
grant execute on function api_v2.set_role_permissions_direct_v2(uuid,text[],text[],uuid,text) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p where p.pronamespace='qarar_iam'::regnamespace and p.proname='set_role_permissions_direct_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_iam',p.proname,pg_get_function_identity_arguments(p.oid),'iam','authenticated' from pg_proc p where p.pronamespace='api_v2'::regnamespace and p.proname='set_role_permissions_direct_v2';
-- Preserve historical approval contracts; normalize their lock order.
CREATE OR REPLACE FUNCTION qarar_iam.admin_request_role_permissions_change(p_role_id uuid, p_permission_codes text[], p_justification text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid:=qarar_iam.current_organization_id(); v_id uuid;
begin
  perform qarar_iam.assert_permission('iam.permissions.manage');
  perform qarar_iam.lock_iam_authority_boundary(v_org);
  if not exists(select 1 from qarar_iam.roles where id=p_role_id and organization_id=v_org) then raise exception 'role not found'; end if;
  if nullif(btrim(p_justification),'') is null then raise exception 'justification is required'; end if;
  insert into qarar_iam.iam_change_requests(organization_id,change_type,target_role_id,payload,justification,requested_by_user_id)
  values(v_org,'role_permissions_replace',p_role_id,jsonb_build_object('permission_codes',to_jsonb(coalesce(p_permission_codes,array[]::text[]))),btrim(p_justification),auth.uid()) returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION qarar_iam.admin_review_iam_change(p_request_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid:=qarar_iam.current_organization_id(); v_req qarar_iam.iam_change_requests%rowtype; v_codes text[]; v_item jsonb; v_role jsonb; v_role_id uuid;
begin
  perform qarar_iam.assert_permission('iam.permissions.manage');
  perform qarar_iam.lock_iam_authority_boundary(v_org);
  select * into v_req from qarar_iam.iam_change_requests where id=p_request_id and organization_id=v_org and status='pending' for update;
  if v_req.id is null then raise exception 'pending change request not found'; end if;
  if v_req.requested_by_user_id=auth.uid() then raise exception 'requester cannot approve their own change' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected'; end if;
  update qarar_iam.iam_change_requests set status=p_decision,reviewed_by_user_id=auth.uid(),reviewed_at=now(),review_notes=p_notes where id=p_request_id;
  if p_decision='approved' and v_req.change_type='role_permissions_replace' then
    select coalesce(array_agg(value),array[]::text[]) into v_codes from jsonb_array_elements_text(v_req.payload->'permission_codes');
    if exists(select 1 from unnest(v_codes) c where not exists(select 1 from qarar_iam.permissions p where p.organization_id=v_org and p.code=c and p.is_active)) then raise exception 'request contains unknown or inactive permissions'; end if;
    update qarar_iam.role_permissions set is_active=false where organization_id=v_org and role_id=v_req.target_role_id;
    insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
    select v_org,v_req.target_role_id,p.id,true from qarar_iam.permissions p where p.organization_id=v_org and p.code=any(v_codes)
    on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();
    update qarar_iam.iam_change_requests set status='applied',applied_at=now() where id=p_request_id;
  elsif p_decision='approved' and v_req.change_type='permission_matrix_import' then
    for v_item in select value from jsonb_array_elements(v_req.payload->'permissions') loop
      insert into qarar_iam.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,description,is_active)
      values(v_org,v_item->>'code',v_item->>'module',v_item->>'action',v_item->>'context_scope',v_item->>'name_ar',v_item->>'name_en',v_item->>'description',coalesce((v_item->>'is_active')::boolean,true))
      on conflict(organization_id,code) do update set module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,is_active=excluded.is_active,updated_at=now();
    end loop;
    for v_role in select value from jsonb_array_elements(v_req.payload->'roles') loop
      insert into qarar_iam.roles(organization_id,code,name_ar,name_en,description,role_scope,is_active)
      values(v_org,v_role->>'code',v_role->>'name_ar',v_role->>'name_en',v_role->>'description',v_role->>'role_scope',coalesce((v_role->>'is_active')::boolean,true))
      on conflict(organization_id,code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,role_scope=excluded.role_scope,is_active=excluded.is_active,updated_at=now()
      returning id into v_role_id;
      update qarar_iam.role_permissions set is_active=false where organization_id=v_org and role_id=v_role_id;
      insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
      select v_org,v_role_id,p.id,true from qarar_iam.permissions p where p.organization_id=v_org and p.code in(select jsonb_array_elements_text(coalesce(v_role->'permissions','[]'::jsonb)))
      on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();
    end loop;
    update qarar_iam.iam_change_requests set status='applied',applied_at=now() where id=p_request_id;
  end if;
end; $function$;
notify pgrst,'reload schema';
commit;
