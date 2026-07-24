-- Make every temporary public compatibility surface owned and time-bounded.

create table qarar_architecture.compatibility_surface_registry (
 relation_name name primary key,
 consumers text[] not null check(cardinality(consumers)>0),
 owning_team text not null,
 client_read_only boolean not null default true,
 removal_not_before date not null,
 replacement text not null
);
revoke all on qarar_architecture.compatibility_surface_registry from public,anon,authenticated;
grant select on qarar_architecture.compatibility_surface_registry to service_role;

insert into qarar_architecture.compatibility_surface_registry(
 relation_name,consumers,owning_team,removal_not_before,replacement
)
select entity_name,array['integration-test-fixtures'],'Supabase / Integration',
 '2026-09-30','Use api_v1 commands and queries'
from qarar_architecture.entity_registry
where legacy_public_view;

update qarar_architecture.compatibility_surface_registry
set consumers=consumers||array['generate-minutes Edge Function']
where relation_name in('meetings','attendance_records','agenda_items','meeting_minutes');

insert into qarar_architecture.compatibility_surface_registry(
 relation_name,consumers,owning_team,removal_not_before,replacement
) values(
 'voting_results_view',array['legacy reporting queries'],'Supabase / Integration',
 '2026-10-31','Add a versioned reporting contract'
);

do $$
declare v_missing text;
begin
 select string_agg(c.relname::text,', ' order by c.relname) into v_missing
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 left join qarar_architecture.compatibility_surface_registry r
  on r.relation_name=c.relname
 where n.nspname='public' and c.relkind='v'
  and not exists(
   select 1 from pg_depend d where d.classid='pg_class'::regclass
    and d.objid=c.oid and d.deptype='e')
  and r.relation_name is null;
 if v_missing is not null then
  raise exception 'unregistered public compatibility views: %',v_missing;
 end if;
end $$;
