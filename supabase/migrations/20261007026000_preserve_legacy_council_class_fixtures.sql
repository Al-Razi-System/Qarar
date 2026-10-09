begin;
create or replace function qarar_core.derive_missing_council_scope_class()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_type uuid;
begin
 -- Historical/administrative fixtures without an authenticated actor retain their
 -- original contract; API commands authenticate before entering this trigger.
 if auth.uid() is null then return new;end if;
 if tg_op='UPDATE' then
  if new.scope_unit_id is distinct from old.scope_unit_id then new.governance_class_id:=null;end if;
 end if;
 if new.governance_class_id is not null or not exists(select 1 from qarar_core.governance_unit_types
  where id=new.unit_type_id and organization_id=new.organization_id and is_council_type) then return new;end if;
 if new.scope_unit_id is not null then
  select unit_type_id into v_type from qarar_core.governance_units
   where id=new.scope_unit_id and organization_id=new.organization_id;
  if not found then raise exception using errcode='23503',message='الوحدة التنظيمية غير موجودة';end if;
 end if;
 new.governance_class_id:=qarar_governance.ensure_organizational_scope_class(new.organization_id,v_type);
 return new;
end $$;

create function qarar_core.protect_linked_organizational_unit_type()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.unit_type_id is distinct from old.unit_type_id and exists(
  select 1 from qarar_core.governance_units where organization_id=old.organization_id and scope_unit_id=old.id
 ) then
  raise exception using errcode='23514',message='الوحدة مرتبطة بمجالس؛ لا يمكن تغيير نوعها قبل مراجعة مساراتها';
 end if;
 return new;
end $$;
alter function qarar_core.protect_linked_organizational_unit_type() owner to qarar_core_executor;
revoke all on function qarar_core.protect_linked_organizational_unit_type() from public,anon,authenticated,service_role;
create trigger protect_linked_organizational_unit_type before update of unit_type_id on qarar_core.governance_units
 for each row execute function qarar_core.protect_linked_organizational_unit_type();
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='qarar_core' and p.proname='protect_linked_organizational_unit_type';
commit;
