begin;

-- Explicit route targets win. Scoped councils derive contextual ancestors from
-- organizational units, never from a second council tree. Old unscoped councils
-- retain their legacy ancestry; instantiated route steps are not rewritten.
create or replace function qarar_governance.resolve_step_unit(
 p_organization_id uuid,p_origin_unit_id uuid,p_explicit_unit_id uuid,p_governance_class_id uuid
) returns uuid language sql stable set search_path=pg_catalog,qarar_core as $function$
 with recursive origin as (
   select u.id,u.scope_unit_id,t.is_council_type from qarar_core.governance_units u
   join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.id=p_origin_unit_id and u.organization_id=p_organization_id and u.status='active'
 ), scopes as (
   select u.id,u.parent_unit_id,0 as depth,array[u.id] as visited
   from origin o join qarar_core.governance_units u on u.id=coalesce(o.scope_unit_id,case when not o.is_council_type then o.id end)
   join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=p_organization_id and u.status='active' and not t.is_council_type
   union all
   select p.id,p.parent_unit_id,s.depth+1,s.visited||p.id from scopes s
   join qarar_core.governance_units p on p.id=s.parent_unit_id
   join qarar_core.governance_unit_types t on t.id=p.unit_type_id and t.organization_id=p.organization_id
   where p.organization_id=p_organization_id and p.status='active' and not t.is_council_type and not p.id=any(s.visited)
 ), legacy as (
   select u.id,u.parent_unit_id,u.governance_class_id,0 as depth,array[u.id] as visited
   from origin o join qarar_core.governance_units u on u.id=o.id
   where o.is_council_type and o.scope_unit_id is null
   union all
   select p.id,p.parent_unit_id,p.governance_class_id,l.depth+1,l.visited||p.id from legacy l
   join qarar_core.governance_units p on p.id=l.parent_unit_id
   where p.organization_id=p_organization_id and p.status='active' and not p.id=any(l.visited)
 ), candidates as (
   select c.id,s.depth from scopes s join qarar_core.governance_units c on c.scope_unit_id=s.id
   join qarar_core.governance_unit_types t on t.id=c.unit_type_id and t.organization_id=c.organization_id
   where c.organization_id=p_organization_id and c.status='active' and t.is_council_type and c.governance_class_id=p_governance_class_id
 ), nearest as (select id from candidates where depth=(select min(depth) from candidates)),
 roots as (
   select u.id from qarar_core.governance_units u
   join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=p_organization_id and u.status='active' and t.is_council_type and u.governance_class_id=p_governance_class_id
   and (u.scope_unit_id is null or exists(select 1 from legacy))
 )
 select case
   when not exists(select 1 from origin) then null
   when p_explicit_unit_id is not null then (select id from qarar_core.governance_units where id=p_explicit_unit_id and organization_id=p_organization_id and status='active')
   when exists(select 1 from scopes) then case
     when exists(select 1 from nearest) then (select id from nearest where (select count(*) from nearest)=1)
     else (select id from roots where (select count(*) from roots)=1) end
   when exists(select 1 from legacy) then coalesce(
     (select id from legacy where governance_class_id=p_governance_class_id order by depth limit 1),
     (select id from roots where (select count(*) from roots)=1))
   else null
 end;
$function$;
alter function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.resolve_step_unit(uuid,uuid,uuid,uuid) to qarar_governance_executor;
commit;
