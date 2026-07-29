begin;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)values
('core','qarar_iam','memberships','Evaluate council administrative membership completeness'),
('core','qarar_iam','roles','Resolve council leadership roles for administrative completeness')
on conflict do nothing;
grant select on qarar_iam.memberships,qarar_iam.roles to qarar_core_executor;

create or replace function qarar_core.admin_validate_council_administrative_readiness(p_council_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();u qarar_core.governance_units;
 errors jsonb:='[]';members integer;chair uuid;rapporteur uuid;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',p_council_id);
 select gu.* into u from qarar_core.governance_units gu join qarar_core.governance_unit_types t
  on t.id=gu.unit_type_id and t.organization_id=gu.organization_id
 where gu.id=p_council_id and gu.organization_id=o and t.is_council_type;
 if u.id is null then raise exception using errcode='P0002',message='المجلس غير موجود';end if;
 if not exists(select 1 from qarar_core.governance_unit_types where id=u.unit_type_id and organization_id=o and is_active)
 then errors:=errors||jsonb_build_array(jsonb_build_object('code','COUNCIL_TYPE_INACTIVE','field','unit_type_id'));end if;
 if u.governance_class_id is null or not exists(select 1 from qarar_governance.governance_unit_classes
  where id=u.governance_class_id and organization_id=o and is_active)
 then errors:=errors||jsonb_build_array(jsonb_build_object('code','GOVERNANCE_CLASS_REQUIRED','field','governance_class_id'));end if;
 select count(distinct m.user_id)::integer into members from qarar_iam.memberships m join qarar_iam.roles r
  on r.id=m.role_id and r.organization_id=m.organization_id
 where m.organization_id=o and m.governance_unit_id=p_council_id and m.membership_status='active'
  and m.start_date<=current_date and(m.end_date is null or m.end_date>=current_date)
  and r.code not in('council_chair','council_rapporteur');
 if members<u.minimum_active_members then errors:=errors||jsonb_build_array(jsonb_build_object(
  'code','MINIMUM_ACTIVE_MEMBERS_NOT_MET','required',u.minimum_active_members,'actual',members));end if;
 select (array_agg(m.user_id)filter(where r.code='council_chair'))[1],
  (array_agg(m.user_id)filter(where r.code='council_rapporteur'))[1] into chair,rapporteur
 from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
 where m.organization_id=o and m.governance_unit_id=p_council_id and m.membership_status='active'
  and m.start_date<=current_date and(m.end_date is null or m.end_date>=current_date);
 if chair is null then errors:=errors||jsonb_build_array(jsonb_build_object('code','COUNCIL_CHAIR_REQUIRED','field','council_chair'));end if;
 if rapporteur is null then errors:=errors||jsonb_build_array(jsonb_build_object('code','COUNCIL_RAPPORTEUR_REQUIRED','field','council_rapporteur'));end if;
 if not u.allow_dual_leadership and chair is not null and chair=rapporteur
 then errors:=errors||jsonb_build_array(jsonb_build_object('code','DUAL_LEADERSHIP_NOT_ALLOWED','field','allow_dual_leadership'));end if;
 perform qarar_audit.append_audit_log(o,'council.administrative_readiness.checked',
  'governance_unit',p_council_id,jsonb_build_object('ready',jsonb_array_length(errors)=0,'errors',errors));
 return jsonb_build_object('council_id',p_council_id,'ready',jsonb_array_length(errors)=0,
  'errors',errors,'active_member_count',members,'minimum_active_members',u.minimum_active_members,
  'chair_user_id',chair,'rapporteur_user_id',rapporteur,'checked_at',now());
end $$;

create or replace function qarar_core.change_council_status(
 p_council_id uuid,p_target_status text,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();a uuid:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
 old_status text;changed timestamptz;readiness jsonb;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',p_council_id);
 if p_target_status not in('active','inactive','archived') or nullif(btrim(p_reason),'') is null
 then raise exception using errcode='22023',message='الحالة والسبب مطلوبان';end if;
 select status into old_status from qarar_core.governance_units where id=p_council_id
  and organization_id=o and updated_at=p_expected_updated_at for update;
 if old_status is null then
  if exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o)
  then raise exception using errcode='40001',message='تم تعديل المجلس؛ حدّث البيانات';end if;
  raise exception using errcode='P0002',message='المجلس غير موجود';
 end if;
 if old_status='archived' then raise exception using errcode='55000',message='أرشفة المجلس نهائية';end if;
 if p_target_status='active' then
  readiness:=qarar_core.admin_validate_council_administrative_readiness(p_council_id);
  if not(readiness->>'ready')::boolean then raise exception using errcode='23514',
   message='المجلس غير مكتمل إداريًا',detail=readiness::text;end if;
 end if;
 if p_target_status='archived' and exists(select 1 from qarar_core.governance_units
  where organization_id=o and parent_unit_id=p_council_id and status<>'archived')
 then raise exception using errcode='23503',message='يجب نقل أو أرشفة المجالس التابعة أولًا';end if;
 update qarar_core.governance_units set status=p_target_status,status_reason=btrim(p_reason),
  status_changed_at=now(),status_changed_by_user_id=a,
  activated_at=case when p_target_status='active' then coalesce(activated_at,now()) else activated_at end,
  archived_at=case when p_target_status='archived' then now() else null end
 where id=p_council_id and organization_id=o returning updated_at into changed;
 insert into qarar_core.governance_unit_status_history(organization_id,governance_unit_id,
  from_status,to_status,reason,changed_by_user_id)
 values(o,p_council_id,old_status,p_target_status,btrim(p_reason),a);
 perform qarar_audit.append_audit_log(o,'council.'||case p_target_status when 'active' then 'activated'
  when 'inactive' then 'deactivated' else 'archived'end,'governance_unit',p_council_id,
  jsonb_build_object('from_status',old_status,'to_status',p_target_status,'reason',btrim(p_reason)));
 return jsonb_build_object('id',p_council_id,'previous_status',old_status,'status',p_target_status,'updated_at',changed);
end $$;

create or replace function qarar_core.admin_activate_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 return qarar_core.change_council_status(p_council_id,'active',p_reason,p_expected_updated_at);
end $$;
create or replace function qarar_core.admin_deactivate_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 return qarar_core.change_council_status(p_council_id,'inactive',p_reason,p_expected_updated_at);
end $$;
create or replace function qarar_core.admin_archive_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 return qarar_core.change_council_status(p_council_id,'archived',p_reason,p_expected_updated_at);
end $$;

alter function qarar_core.admin_validate_council_administrative_readiness(uuid) owner to qarar_core_executor;
alter function qarar_core.change_council_status(uuid,text,text,timestamptz) owner to qarar_core_executor;
alter function qarar_core.admin_activate_council(uuid,text,timestamptz) owner to qarar_core_executor;
alter function qarar_core.admin_deactivate_council(uuid,text,timestamptz) owner to qarar_core_executor;
alter function qarar_core.admin_archive_council(uuid,text,timestamptz) owner to qarar_core_executor;
revoke all on function qarar_core.admin_validate_council_administrative_readiness(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_core.change_council_status(uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_activate_council(uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_deactivate_council(uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_archive_council(uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_validate_council_administrative_readiness(uuid) to qarar_core_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_core' and p.proname in(
 'admin_validate_council_administrative_readiness','change_council_status',
 'admin_activate_council','admin_deactivate_council','admin_archive_council')
on conflict(function_name,identity_arguments)do update set function_oid=excluded.function_oid,module_code='core',owning_schema='qarar_core';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)values
('v1','admin_validate_council_administrative_readiness','qarar_core','admin_validate_council_administrative_readiness','p_council_id uuid','core','authenticated'),
('v1','admin_activate_council','qarar_core','admin_activate_council','p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','core','authenticated'),
('v1','admin_deactivate_council','qarar_core','admin_deactivate_council','p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','core','authenticated'),
('v1','admin_archive_council','qarar_core','admin_archive_council','p_council_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','core','authenticated')
on conflict do nothing;
create or replace function api_v1.admin_validate_council_administrative_readiness(p_council_id uuid)returns jsonb
language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_validate_council_administrative_readiness($1)$$;
create or replace function api_v1.admin_activate_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_activate_council($1,$2,$3)$$;
create or replace function api_v1.admin_deactivate_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_deactivate_council($1,$2,$3)$$;
create or replace function api_v1.admin_archive_council(p_council_id uuid,p_reason text,p_expected_updated_at timestamptz)returns jsonb
language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_archive_council($1,$2,$3)$$;
alter function api_v1.admin_validate_council_administrative_readiness(uuid) owner to qarar_api_executor;
alter function api_v1.admin_activate_council(uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.admin_deactivate_council(uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.admin_archive_council(uuid,text,timestamptz) owner to qarar_api_executor;
revoke all on function api_v1.admin_validate_council_administrative_readiness(uuid) from public,anon,service_role;
revoke all on function api_v1.admin_activate_council(uuid,text,timestamptz) from public,anon,service_role;
revoke all on function api_v1.admin_deactivate_council(uuid,text,timestamptz) from public,anon,service_role;
revoke all on function api_v1.admin_archive_council(uuid,text,timestamptz) from public,anon,service_role;
grant execute on function api_v1.admin_validate_council_administrative_readiness(uuid) to authenticated;
grant execute on function api_v1.admin_activate_council(uuid,text,timestamptz) to authenticated;
grant execute on function api_v1.admin_deactivate_council(uuid,text,timestamptz) to authenticated;
grant execute on function api_v1.admin_archive_council(uuid,text,timestamptz) to authenticated;
grant execute on function qarar_core.admin_validate_council_administrative_readiness(uuid) to qarar_api_executor;
grant execute on function qarar_core.admin_activate_council(uuid,text,timestamptz) to qarar_api_executor;
grant execute on function qarar_core.admin_deactivate_council(uuid,text,timestamptz) to qarar_api_executor;
grant execute on function qarar_core.admin_archive_council(uuid,text,timestamptz) to qarar_api_executor;

update qarar_architecture.api_release_registry
set contract_count=139,contract_hash='cdc327e880ca8daf96a62baacce9789c',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 PB-078 adds administrative readiness and council lifecycle contracts.'
where api_version='v1';

commit;
