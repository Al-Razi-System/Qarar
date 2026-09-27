begin;

-- Workflow steps normally resolve against the submitting unit or one of its
-- ancestors.  Some valid governed routes move between peer/root councils
-- (for example University Council -> Board of Trustees), so use the sole
-- active organization unit of the requested class when no ancestor matches.
create or replace function qarar_governance.resolve_step_unit(
  p_organization_id uuid,
  p_origin_unit_id uuid,
  p_explicit_unit_id uuid,
  p_governance_class_id uuid
) returns uuid
language sql
stable
set search_path to 'pg_catalog', 'qarar_core'
as $function$
  with recursive ancestors as (
    select u.id, u.parent_unit_id, u.governance_class_id, 0 as depth
    from qarar_core.governance_units u
    where u.id = p_origin_unit_id
      and u.organization_id = p_organization_id
      and u.status = 'active'
    union all
    select parent.id, parent.parent_unit_id, parent.governance_class_id, ancestors.depth + 1
    from ancestors
    join qarar_core.governance_units parent on parent.id = ancestors.parent_unit_id
    where parent.organization_id = p_organization_id
      and parent.status = 'active'
  ), class_units as (
    select u.id, count(*) over () as matching_count
    from qarar_core.governance_units u
    where u.organization_id = p_organization_id
      and u.governance_class_id = p_governance_class_id
      and u.status = 'active'
  )
  select case
    when p_explicit_unit_id is not null then (
      select u.id from qarar_core.governance_units u
      where u.id = p_explicit_unit_id
        and u.organization_id = p_organization_id
        and u.status = 'active'
    )
    else coalesce(
      (select id from ancestors where governance_class_id = p_governance_class_id order by depth limit 1),
      (select id from class_units where matching_count = 1 limit 1)
    )
  end;
$function$;

alter function qarar_governance.resolve_step_unit(uuid, uuid, uuid, uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.resolve_step_unit(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.resolve_step_unit(uuid, uuid, uuid, uuid)
  to qarar_governance_executor;

commit;
