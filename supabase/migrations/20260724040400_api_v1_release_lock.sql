-- Freeze the complete v1 signature/result/audience surface.

create table qarar_architecture.api_release_registry (
 api_version text primary key,
 contract_count integer not null check(contract_count>0),
 contract_hash text not null check(contract_hash~'^[0-9a-f]{32}$'),
 released_at timestamptz not null,
 removal_not_before date,
 notes text not null
);
revoke all on qarar_architecture.api_release_registry from public,anon,authenticated;
grant select on qarar_architecture.api_release_registry to service_role;

insert into qarar_architecture.api_release_registry(
 api_version,contract_count,contract_hash,released_at,removal_not_before,notes
) values(
 'v1',78,'bd772e41621a513f019624e604b870fb','2026-07-24 00:00:00+00',
 '2027-01-01','Any signature, result, or audience change requires api_v2 or an explicit reviewed v1 release migration.'
);

do $$
declare v_count integer;v_hash text;
begin
 select count(*),md5(string_agg(
  p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
  pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
  order by p.proname,pg_get_function_identity_arguments(p.oid)
 )) into v_count,v_hash
 from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
 join qarar_architecture.api_contract_registry r
  on r.api_version='v1' and r.contract_name=p.proname
  and r.identity_arguments=pg_get_function_identity_arguments(p.oid);
 if v_count<>78 or v_hash<>'bd772e41621a513f019624e604b870fb' then
  raise exception 'api_v1 release mismatch: count %, hash %',v_count,v_hash;
 end if;
end $$;
