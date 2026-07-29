begin;

create or replace function qarar_iam.admin_assign_council_leadership(
 p_council_id uuid,p_role_code text,p_user_id uuid,p_effective_date date,
 p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare o uuid:=qarar_iam.current_organization_id();r uuid;other_code text;
 dual_allowed boolean;old_membership qarar_iam.memberships;new_id uuid;changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.leadership.assign',p_council_id);
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||p_council_id::text,0));
 if p_role_code not in('council_chair','council_rapporteur') or p_effective_date is null
  or nullif(btrim(p_reason),'') is null
 then raise exception using errcode='22023',message='دور القيادة وتاريخ النفاذ والسبب مطلوبة';end if;
 select allow_dual_leadership into dual_allowed from qarar_core.governance_units u
 join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
 where u.id=p_council_id and u.organization_id=o and u.status<>'archived' and t.is_council_type
  and u.updated_at=p_expected_updated_at;
 if dual_allowed is null then
  if exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o)
  then raise exception using errcode='40001',message='تم تعديل المجلس؛ حدّث البيانات';end if;
  raise exception using errcode='P0002',message='المجلس غير موجود أو مؤرشف';
 end if;
 select id into r from qarar_iam.roles where organization_id=o and code=p_role_code
  and is_active and role_scope='governance_unit';
 if r is null then raise exception using errcode='23503',message='دور القيادة غير مهيأ داخل المؤسسة';end if;
 if not exists(select 1 from qarar_iam.memberships m join qarar_iam.roles mr
   on mr.id=m.role_id and mr.organization_id=m.organization_id
  where m.organization_id=o and m.governance_unit_id=p_council_id and m.user_id=p_user_id
   and m.membership_status='active' and m.start_date<=p_effective_date
   and(m.end_date is null or m.end_date>=p_effective_date)
   and mr.code not in('council_chair','council_rapporteur'))
 then raise exception using errcode='23503',message='يجب أن يكون القائد عضوًا فعالًا في المجلس';end if;
 other_code:=case p_role_code when 'council_chair' then 'council_rapporteur' else 'council_chair'end;
 if not dual_allowed and exists(select 1 from qarar_iam.memberships m join qarar_iam.roles rr
   on rr.id=m.role_id and rr.organization_id=m.organization_id
  where m.organization_id=o and m.governance_unit_id=p_council_id and m.user_id=p_user_id
   and rr.code=other_code and m.membership_status='active' and m.start_date<=p_effective_date
   and(m.end_date is null or m.end_date>=p_effective_date))
 then raise exception using errcode='23514',message='لا يسمح المجلس بازدواج أدوار القيادة';end if;
 select m.* into old_membership from qarar_iam.memberships m where m.organization_id=o
  and m.governance_unit_id=p_council_id and m.role_id=r and m.membership_status='active'
  and m.start_date<=p_effective_date and(m.end_date is null or m.end_date>=p_effective_date)
  order by m.start_date desc limit 1 for update;
 if old_membership.user_id=p_user_id then
  return jsonb_build_object('membership_id',old_membership.id,'role_code',p_role_code,
   'user_id',p_user_id,'effective_date',p_effective_date,'idempotent_replay',true);
 end if;
 if old_membership.id is not null then
  if p_effective_date<=old_membership.start_date then
   raise exception using errcode='22023',message='تاريخ القيادة الجديدة يجب أن يلي بداية القيادة الحالية';end if;
  update qarar_iam.memberships set membership_status='ended',end_date=p_effective_date-1
   where id=old_membership.id;
 end if;
 insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,
  membership_title,membership_status,start_date)
 values(o,p_user_id,p_council_id,r,case p_role_code when 'council_chair' then 'رئيس المجلس' else 'مقرر المجلس'end,
  'active',p_effective_date)returning id into new_id;
 changed:=p_expected_updated_at;
 perform qarar_audit.append_audit_log(o,'council.leadership.changed','governance_unit',p_council_id,
  jsonb_build_object('role_code',p_role_code,'from_user_id',old_membership.user_id,
   'to_user_id',p_user_id,'effective_date',p_effective_date,'reason',btrim(p_reason)));
 return jsonb_build_object('membership_id',new_id,'role_code',p_role_code,'user_id',p_user_id,
  'effective_date',p_effective_date,'council_updated_at',changed,'idempotent_replay',false);
end $$;

alter function qarar_iam.admin_assign_council_leadership(uuid,text,uuid,date,text,timestamptz) owner to qarar_iam_executor;
revoke all on function qarar_iam.admin_assign_council_leadership(uuid,text,uuid,date,text,timestamptz) from public,anon,authenticated,service_role;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_iam' and p.proname='admin_assign_council_leadership'
on conflict(function_name,identity_arguments)do update set function_oid=excluded.function_oid,module_code='iam',owning_schema='qarar_iam';
update qarar_architecture.api_release_registry
set contract_count=135,contract_hash='c53f96daeea611dfe8ef42d6b49b9d33',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 PB-077 adds atomic council leadership assignment.'
where api_version='v1';

commit;
