begin;
create function qarar_governance.ensure_organizational_scope_class(p_organization_id uuid,p_unit_type_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_type qarar_core.governance_unit_types%rowtype;v_code text;v_name text;v_level text;v_id uuid;
begin
 if p_organization_id is distinct from qarar_iam.current_organization_id() then
  raise exception using errcode='42501',message='لا يمكن تحديد تصنيف خارج المنظمة';
 end if;
 if p_unit_type_id is null then
  v_code:='institution_scope';v_name:='على مستوى المؤسسة';v_level:='other';
 else
  select * into v_type from qarar_core.governance_unit_types
   where id=p_unit_type_id and organization_id=p_organization_id and not is_council_type;
  if not found then raise exception using errcode='23503',message='نوع الوحدة التنظيمية غير موجود';end if;
  case btrim(v_type.name_ar)
   when 'كلية' then v_level:='faculty';v_code:='faculty_council';v_name:='مجلس كلية';
   when 'قسم' then v_level:='department';v_code:='department_council';v_name:='مجلس قسم';
   when 'قسم اكاديمي' then v_level:='department';v_code:='department_council';v_name:='مجلس قسم';
   when 'قسم أكاديمي' then v_level:='department';v_code:='department_council';v_name:='مجلس قسم';
   when 'جامعة' then v_level:='university';v_code:='university_council';v_name:='مجلس جامعة';
   when 'رئاسة الجامعة' then v_level:='university';v_code:='university_council';v_name:='مجلس جامعة';
   else v_level:='other';v_code:='organizational_type_'||replace(v_type.id::text,'-','_');v_name:='مجلس '||v_type.name_ar;
  end case;
 end if;
 -- Existing route class identities remain stable; a disabled class stays disabled.
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':scope-class:'||v_code,0));
 select id into v_id from qarar_governance.governance_unit_classes
  where organization_id=p_organization_id and code=v_code;
 if v_id is null then
  insert into qarar_governance.governance_unit_classes(organization_id,code,name_ar,governance_level)
   values(p_organization_id,v_code,v_name,v_level) returning id into v_id;
  perform qarar_audit.append_audit_log(p_organization_id,'council.scope_class.derived','governance_unit_classes',v_id,
   jsonb_build_object('organizational_unit_type_id',p_unit_type_id,'governance_level',v_level));
 end if;
 return v_id;
end $$;
alter function qarar_governance.ensure_organizational_scope_class(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.ensure_organizational_scope_class(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.ensure_organizational_scope_class(uuid,uuid) to qarar_core_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('core','qarar_governance','ensure_organizational_scope_class','p_organization_id uuid, p_unit_type_id uuid',
 'Derive route-compatible council class from organizational unit type without duplicate UI input');

create function qarar_core.derive_missing_council_scope_class()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_type uuid;
begin
 if new.governance_class_id is not null or not exists(select 1 from qarar_core.governance_unit_types
  where id=new.unit_type_id and organization_id=new.organization_id and is_council_type) then return new;end if;
 -- Historical explicit classifications remain intact; missing ones are derived.
 if new.scope_unit_id is not null then
  select unit_type_id into v_type from qarar_core.governance_units
   where id=new.scope_unit_id and organization_id=new.organization_id;
  if not found then raise exception using errcode='23503',message='الوحدة التنظيمية غير موجودة';end if;
 end if;
 new.governance_class_id:=qarar_governance.ensure_organizational_scope_class(new.organization_id,v_type);
 return new;
end $$;
alter function qarar_core.derive_missing_council_scope_class() owner to qarar_core_executor;
revoke all on function qarar_core.derive_missing_council_scope_class() from public,anon,authenticated,service_role;
create trigger derive_missing_council_scope_class before insert or update of governance_class_id,scope_unit_id,unit_type_id
 on qarar_core.governance_units for each row execute function qarar_core.derive_missing_council_scope_class();
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
 case n.nspname when 'qarar_core' then 'core' else 'governance' end,n.nspname,false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='qarar_core' and p.proname='derive_missing_council_scope_class')
 or (n.nspname='qarar_governance' and p.proname='ensure_organizational_scope_class');
commit;
