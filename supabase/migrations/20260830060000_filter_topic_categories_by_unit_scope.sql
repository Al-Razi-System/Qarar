begin;

-- Return only categories backed by an executable policy item whose effective
-- scope includes the selected governance unit.  The previous implementation
-- returned every active organization category and merely attached a zero
-- count to unrelated categories.
create or replace function qarar_topics.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default null::date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_unit qarar_core.governance_units%rowtype;
  v_governance_level text;
  v_effective_on date := coalesce(p_effective_on, timezone('Asia/Riyadh', now())::date);
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'يلزم حساب نشط ومصادق عليه';
  end if;

  perform qarar_iam.assert_permission('topics.create', p_governance_unit_id);

  select * into v_unit
  from qarar_core.governance_units
  where id = p_governance_unit_id
    and organization_id = v_org
    and status = 'active';

  if v_unit.id is null then
    raise exception using errcode = 'P0002', message = 'المجلس غير موجود أو غير نشط';
  end if;

  select governance_level into v_governance_level
  from qarar_governance.governance_unit_classes
  where id = v_unit.governance_class_id
    and organization_id = v_org;

  return jsonb_build_object(
    'governance_unit_id', v_unit.id,
    'effective_on', v_effective_on,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'code', category.code,
          'name_ar', category.name_ar,
          'name_en', category.name_en,
          'executable_item_count', category.executable_item_count
        ) order by category.name_ar
      )
      from (
        select c.id, c.code, c.name_ar, c.name_en,
               count(distinct pi.id)::integer as executable_item_count
        from qarar_governance.policies p
        join qarar_governance.policy_versions pv
          on pv.policy_id = p.id and pv.organization_id = p.organization_id
        join qarar_governance.policy_items pi
          on pi.policy_version_id = pv.id and pi.organization_id = p.organization_id
        join qarar_topics.topic_categories c
          on c.id = pi.topic_category_id and c.organization_id = p.organization_id and c.is_active
        join qarar_governance.policy_scope_assignments sa
          on sa.policy_version_id = pv.id and sa.organization_id = p.organization_id
        where p.organization_id = v_org
          and p.status = 'active'
          and pv.legal_status = 'effective'
          and pv.automation_status in ('ready', 'active')
          and (pv.effective_from is null or v_effective_on >= pv.effective_from)
          and (pv.effective_to is null or v_effective_on <= pv.effective_to)
          and pi.is_active
          and pi.requires_executable_rule
          and sa.is_active
          and (sa.valid_from is null or v_effective_on >= sa.valid_from)
          and (sa.valid_to is null or v_effective_on <= sa.valid_to)
          and (
            sa.scope_type = 'organization'
            or (sa.scope_type = 'governance_unit' and sa.governance_unit_id = v_unit.id)
            or (sa.scope_type = 'governance_class' and sa.governance_class_id = v_unit.governance_class_id)
            or (sa.scope_type = 'governance_level' and sa.governance_level = v_governance_level)
            or (sa.scope_type = 'governance_unit_type' and sa.governance_unit_type_id = v_unit.unit_type_id)
            or (sa.scope_type = 'unit_subtree' and exists (
              with recursive descendants as (
                select id from qarar_core.governance_units
                where id = sa.governance_unit_id and organization_id = v_org
                union all
                select child.id
                from qarar_core.governance_units child
                join descendants parent on child.parent_unit_id = parent.id
                where child.organization_id = v_org
              )
              select 1 from descendants where id = v_unit.id
            ))
          )
          and not exists (
            select 1
            from qarar_governance.policy_item_scope_overrides scope_override
            where scope_override.policy_item_id = pi.id
              and scope_override.scope_assignment_id = sa.id
              and scope_override.governance_unit_id = v_unit.id
              and not scope_override.is_included
              and (scope_override.valid_from is null or v_effective_on >= scope_override.valid_from)
              and (scope_override.valid_to is null or v_effective_on <= scope_override.valid_to)
          )
        group by c.id, c.code, c.name_ar, c.name_en
      ) category
    ), '[]'::jsonb)
  );
end;
$function$;

alter function qarar_topics.get_topic_categories_for_unit(uuid, date)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  to qarar_api_executor, qarar_topics_executor;

commit;
