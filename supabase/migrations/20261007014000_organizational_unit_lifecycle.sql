begin;

-- Serialize structural writes from every core consumer, including V1 contracts.
-- Unchanged historical links remain legal; new links must target active units.
create function qarar_core.guard_organizational_unit_links()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_council boolean; v_check_parent boolean; v_check_scope boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':unit-hierarchy',0));
  select is_council_type into v_council from qarar_core.governance_unit_types
    where id=new.unit_type_id and organization_id=new.organization_id;
  if tg_op='INSERT' then
    v_check_parent:=true; v_check_scope:=true;
  else
    v_check_parent:=new.parent_unit_id is distinct from old.parent_unit_id
      or (new.status='active' and old.status<>'active');
    v_check_scope:=new.scope_unit_id is distinct from old.scope_unit_id;
  end if;
  if v_check_scope and new.scope_unit_id is not null and not exists(
    select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t
      on t.id=u.unit_type_id and t.organization_id=u.organization_id
    where u.id=new.scope_unit_id and u.organization_id=new.organization_id and u.status='active' and not t.is_council_type
  ) then raise exception using errcode='23514',message='اختر وحدة تنظيمية نشطة لربط المجلس'; end if;
  if not coalesce(v_council,true) then
    if v_check_parent and new.parent_unit_id is not null then
      if not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t
        on t.id=u.unit_type_id and t.organization_id=u.organization_id
        where u.id=new.parent_unit_id and u.organization_id=new.organization_id and u.status='active' and not t.is_council_type
      ) then raise exception using errcode='23514',message='اختر جهة تابعة لها نشطة وليست مجلسًا'; end if;
      if exists(with recursive ancestors as (
        select id,parent_unit_id from qarar_core.governance_units where id=new.parent_unit_id and organization_id=new.organization_id
        union select u.id,u.parent_unit_id from qarar_core.governance_units u join ancestors a on u.id=a.parent_unit_id where u.organization_id=new.organization_id
      ) select 1 from ancestors where id=new.id) then
        raise exception using errcode='23514',message='لا يمكن جعل الوحدة تابعة لنفسها أو لإحدى وحداتها الفرعية';
      end if;
    end if;
    if new.status<>'archived' and exists(select 1 from qarar_core.governance_units u
      where u.organization_id=new.organization_id and u.id<>new.id and u.unit_type_id=new.unit_type_id
      and u.name_ar=new.name_ar and u.parent_unit_id is not distinct from new.parent_unit_id and u.status<>'archived') then
      raise exception using errcode='23505',message='هذه الوحدة موجودة بالفعل تحت الجهة المحددة';
    end if;
    if tg_op='UPDATE' and new.status<>old.status and new.status in ('inactive','archived')
      and exists(select 1 from qarar_core.governance_units where organization_id=new.organization_id and parent_unit_id=new.id and status='active') then
      raise exception using errcode='23514',message='عالج الوحدات الفرعية النشطة أولًا قبل تعطيل هذه الوحدة أو حذفها';
    end if;
  end if;
  return new;
end $$;
alter function qarar_core.guard_organizational_unit_links() owner to qarar_core_executor;
revoke all on function qarar_core.guard_organizational_unit_links() from public,anon,authenticated,service_role;
create trigger governance_units_guard_organizational_links before insert or update of parent_unit_id,scope_unit_id,unit_type_id,name_ar,status
  on qarar_core.governance_units for each row execute function qarar_core.guard_organizational_unit_links();

create function qarar_core.admin_update_organizational_unit_v2(
  p_unit_id uuid,p_name_ar text,p_unit_type_id uuid,p_parent_unit_id uuid,p_status text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_unit qarar_core.governance_units%rowtype; v_level integer:=1; v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':unit-hierarchy',0));
  select u.* into v_unit from qarar_core.governance_units u join qarar_core.governance_unit_types t
    on t.id=u.unit_type_id and t.organization_id=u.organization_id
    where u.id=p_unit_id and u.organization_id=v_org and not t.is_council_type for update of u;
  if v_unit.id is null then raise exception using errcode='P0002',message='الوحدة التنظيمية غير موجودة'; end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_unit.updated_at then
    raise exception using errcode='40001',message='تم تعديل الوحدة؛ حدّث القائمة ثم أعد المحاولة'; end if;
  if v_unit.status='archived' then raise exception using errcode='23514',message='الوحدة محذوفة منطقيًا؛ لا يمكن تعديل سجلها'; end if;
  if char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 or p_status is null or p_status not in ('active','inactive','archived') then
    raise exception using errcode='22023',message='أدخل بيانات الوحدة بشكل صحيح'; end if;
  if not exists(select 1 from qarar_core.governance_unit_types where organization_id=v_org and id=p_unit_type_id
    and not is_council_type and (is_active or id=v_unit.unit_type_id)) then
    raise exception using errcode='22023',message='اختر نوع وحدة تنظيمية نشطًا'; end if;
  if p_parent_unit_id is not null then
    select level_no+1 into v_level from qarar_core.governance_units where organization_id=v_org and id=p_parent_unit_id;
    if v_level is null then raise exception using errcode='23514',message='الجهة التابعة لها غير موجودة'; end if;
  end if;
  update qarar_core.governance_units set name_ar=btrim(p_name_ar),unit_type_id=p_unit_type_id,parent_unit_id=p_parent_unit_id,
    level_no=v_level,status=p_status,
    activated_at=case when p_status='active' then coalesce(activated_at,clock_timestamp()) else activated_at end,
    archived_at=case when p_status='archived' then clock_timestamp() else null end,
    status_reason=case when p_status<>v_unit.status then 'organizational_unit_management' else status_reason end,
    status_changed_at=case when p_status<>v_unit.status then clock_timestamp() else status_changed_at end,
    status_changed_by_user_id=case when p_status<>v_unit.status then auth.uid() else status_changed_by_user_id end
    where id=v_unit.id returning to_jsonb(governance_units) into v_result;
  if p_parent_unit_id is distinct from v_unit.parent_unit_id then
    with recursive descendants as (
      select id,level_no from qarar_core.governance_units where id=v_unit.id and organization_id=v_org
      union all select u.id,d.level_no+1 from qarar_core.governance_units u join descendants d on u.parent_unit_id=d.id where u.organization_id=v_org
    ) update qarar_core.governance_units u set level_no=d.level_no from descendants d where u.id=d.id and u.id<>v_unit.id;
  end if;
  if p_status<>v_unit.status then
    insert into qarar_core.governance_unit_status_history(organization_id,governance_unit_id,from_status,to_status,reason,changed_by_user_id)
      values(v_org,v_unit.id,v_unit.status,p_status,'organizational_unit_management',auth.uid());
  end if;
  perform qarar_audit.append_audit_log(v_org,'organizational.unit.updated','governance_units',v_unit.id,
    jsonb_build_object('previous_name',v_unit.name_ar,'previous_parent_id',v_unit.parent_unit_id,'previous_type_id',v_unit.unit_type_id,
      'previous_status',v_unit.status,'name_ar',p_name_ar,'parent_id',p_parent_unit_id,'type_id',p_unit_type_id,'status',p_status,'logical_delete',p_status='archived'));
  return jsonb_build_object('id',v_unit.id,'reference_number',v_unit.reference_number,'status',p_status,'updated_at',v_result->'updated_at');
end $$;
alter function qarar_core.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) owner to qarar_core_executor;
revoke all on function qarar_core.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) to qarar_api_executor;
create function api_v2.admin_update_organizational_unit_v2(p_unit_id uuid,p_name_ar text,p_unit_type_id uuid,p_parent_unit_id uuid,p_status text,p_expected_updated_at timestamptz)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_update_organizational_unit_v2($1,$2,$3,$4,$5,$6)$$;
alter function api_v2.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) owner to qarar_api_executor;
revoke all on function api_v2.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function api_v2.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_core',p.proname,pg_get_function_identity_arguments(p.oid),'core','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname='admin_update_organizational_unit_v2';
notify pgrst,'reload schema';
commit;
