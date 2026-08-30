begin;

create or replace function qarar_governance.conditions_match(p_conditions jsonb,p_context jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare k text;v jsonb;
begin
  if p_conditions is null or p_conditions='{}'::jsonb then return true;end if;
  if jsonb_typeof(p_conditions)<>'object' then return false;end if;
  for k,v in select * from jsonb_each(p_conditions) loop
    if k='all' then
      if not coalesce((select bool_and(qarar_governance.conditions_match(x,p_context)) from jsonb_array_elements(v)x),false) then return false;end if;
    elsif k='any' then
      if not coalesce((select bool_or(qarar_governance.conditions_match(x,p_context)) from jsonb_array_elements(v)x),false) then return false;end if;
    elsif k='not' then
      if qarar_governance.conditions_match(v,p_context) then return false;end if;
    elsif jsonb_typeof(v)='array' then
      if not exists(select 1 from jsonb_array_elements(v) candidate where candidate=p_context->k) then return false;end if;
    elsif p_context->k is distinct from v then return false;
    end if;
  end loop;
  return true;
end $$;

revoke execute on function api_v1.open_meeting_session(uuid,timestamptz)
  from public, anon;
revoke execute on function api_v1.cast_vote(uuid,text,text)
  from public, anon;
revoke execute on function api_v1.self_check_in(uuid,text,text)
  from public, anon;

grant execute on function api_v1.open_meeting_session(uuid,timestamptz)
  to authenticated, service_role;
grant execute on function api_v1.cast_vote(uuid,text,text)
  to authenticated, service_role;
grant execute on function api_v1.self_check_in(uuid,text,text)
  to authenticated, service_role;

-- Internal IAM mutations must remain behind the reviewed api_v1 workflow.
revoke execute on function qarar_iam.admin_set_role_permissions(uuid,text[])
  from public, anon, authenticated, service_role;
grant execute on function qarar_iam.admin_set_role_permissions(uuid,text[])
  to qarar_api_executor;

-- Edge-only rate limiting cannot be invoked from a browser JWT.
revoke execute on function api_v1.service_consume_iam_rate_limit(uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function api_v1.service_consume_iam_rate_limit(uuid,text,integer,integer)
  to service_role;

revoke execute on function qarar_iam.admin_update_user_status(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function qarar_iam.admin_update_user_status(uuid,text,text)
  to qarar_api_executor;

revoke execute on function api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
  to service_role;

revoke execute on function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  to qarar_api_executor;

revoke execute on function api_v1.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  from public, anon;
grant execute on function api_v1.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  to authenticated, service_role;

revoke execute on function api_v1.service_apply_user_status(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function api_v1.service_apply_user_status(uuid,uuid,text,text)
  to service_role;

alter function api_v1.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text)
  set search_path=pg_catalog;
alter function api_v1.admin_get_policy_detail(uuid) set search_path=pg_catalog;
alter function api_v1.admin_remove_policy_attachment(uuid) set search_path=pg_catalog;
alter function api_v1.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text)
  set search_path=pg_catalog;
alter function api_v1.get_policy_form_options() set search_path=pg_catalog;
alter function api_v1.preview_policy_conditions(jsonb,jsonb) set search_path=pg_catalog;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values
  ('policy_attachments','governance',true),
  ('policy_rules','governance',false),
  ('rule_conditions','governance',false),
  ('rule_requirements','governance',false),
  ('rule_authorities','governance',false),
  ('rule_actions','governance',false),
  ('rule_workflow_bindings','governance',false),
  ('policy_references','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code;

-- Rebuild runtime grants from the registries so legacy PUBLIC defaults cannot
-- bypass module ownership, RLS, or the versioned API facade.
do $$
declare r record;
begin
  for r in
    select n.nspname,c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname like 'qarar\_%' escape '\' and c.relkind in('r','p')
  loop
    execute format('revoke all on table %I.%I from public,anon,authenticated,qarar_api_executor',r.nspname,r.relname);
    execute format('grant select on table %I.%I to service_role',r.nspname,r.relname);
    if exists(
      select 1 from qarar_architecture.entity_registry e
      join qarar_architecture.module_registry m using(module_code)
      where e.entity_name=r.relname and m.schema_name=r.nspname and e.legacy_public_view
    ) then
      execute format('grant select on table %I.%I to authenticated',r.nspname,r.relname);
    end if;
  end loop;

  for r in
    select p.oid::regprocedure signature,fr.is_rls_predicate
    from qarar_architecture.function_registry fr
    join pg_proc p on p.oid=fr.function_oid
  loop
    execute format('revoke execute on function %s from public,anon,authenticated,service_role',r.signature);
    if r.is_rls_predicate then
      execute format('grant execute on function %s to authenticated,service_role',r.signature);
    end if;
  end loop;

  for r in
    select p.oid::regprocedure signature,cr.audience,
      impl.oid::regprocedure implementation_signature
    from qarar_architecture.api_contract_registry cr
    join pg_proc p on p.proname=cr.contract_name
      and pg_get_function_identity_arguments(p.oid)=cr.identity_arguments
    join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
    join pg_namespace impl_ns on impl_ns.nspname=cr.implementation_schema
    join pg_proc impl on impl.pronamespace=impl_ns.oid
      and impl.proname=cr.implementation_name
      and pg_get_function_identity_arguments(impl.oid)=cr.identity_arguments
    where cr.api_version='v1'
  loop
    execute format('revoke execute on function %s from public,anon,authenticated,service_role',r.signature);
    if r.audience='authenticated' then
      execute format('grant execute on function %s to authenticated,service_role',r.signature);
    elsif r.audience='service_role' then
      execute format('grant execute on function %s to service_role',r.signature);
    end if;
    execute format('grant execute on function %s to qarar_api_executor',r.implementation_signature);
  end loop;
end $$;

do $$
declare source record; target record; fn record; role_name text;
begin
  for source in select module_code,schema_name from qarar_architecture.module_registry loop
    role_name:=format('qarar_%s_executor',source.module_code);
    for target in
      select m.module_code,m.schema_name,c.relname
      from qarar_architecture.module_registry m
      join pg_namespace n on n.nspname=m.schema_name
      join pg_class c on c.relnamespace=n.oid and c.relkind in('r','p')
      where m.module_code<>source.module_code
    loop
      if not (target.schema_name='qarar_audit' and target.relname='audit_logs')
        and not (source.module_code in('attendance','minutes','voting') and target.schema_name='qarar_meetings' and target.relname in('meetings','meeting_status_history'))
        and not (source.module_code='meetings' and target.schema_name='qarar_topics' and target.relname='topics')
        and not (source.module_code='voting' and target.schema_name='qarar_meetings' and target.relname='agenda_items') then
        execute format('revoke insert,update,delete,truncate,references,trigger on table %I.%I from %I',target.schema_name,target.relname,role_name);
      end if;
      if not exists(
        select 1 from qarar_architecture.module_table_read_allowlist a
        where a.source_module=source.module_code and a.target_schema=target.schema_name and a.table_name=target.relname
      ) then
        execute format('revoke select on table %I.%I from %I',target.schema_name,target.relname,role_name);
      end if;
    end loop;

    for fn in
      select p.oid::regprocedure signature,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join qarar_architecture.module_registry m on m.schema_name=n.nspname
      where m.module_code<>source.module_code
    loop
      if not exists(
        select 1 from qarar_architecture.module_function_execute_allowlist a
        where a.source_module=source.module_code and a.target_schema=fn.nspname
          and a.function_name=fn.proname and a.identity_arguments=fn.args
      ) then
        execute format('revoke execute on function %s from %I',fn.signature,role_name);
      end if;
    end loop;
  end loop;
end $$;

update qarar_architecture.api_release_registry
set contract_hash=(
  select md5(string_agg(
    p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
    pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
    order by p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry r
    on r.contract_name=p.proname
   and r.identity_arguments=pg_get_function_identity_arguments(p.oid)
  where r.api_version='v1'
),contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),released_at=now()
where api_version='v1';

do $$
declare r record;
begin
  for r in
    select impl.oid::regprocedure signature
    from qarar_architecture.api_contract_registry cr
    join pg_namespace n on n.nspname=cr.implementation_schema
    join pg_proc impl on impl.pronamespace=n.oid
      and impl.proname=cr.implementation_name
      and pg_get_function_identity_arguments(impl.oid)=cr.identity_arguments
    where cr.api_version='v1'
  loop
    execute format('grant execute on function %s to qarar_api_executor',r.signature);
  end loop;
end $$;

commit;
