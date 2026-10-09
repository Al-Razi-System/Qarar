begin;
create table qarar_iam.user_submission_profiles_v2(
 user_id uuid primary key,organization_id uuid not null,home_unit_id uuid,revision integer not null default 0 check(revision>=0),
 last_request_id uuid,last_input jsonb,updated_at timestamptz not null default now(),updated_by uuid,
 foreign key(user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
 foreign key(home_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
 unique(user_id,organization_id));
create table qarar_iam.user_submission_grants_v2(
 id uuid primary key default gen_random_uuid(),reference_number text not null,organization_id uuid not null,user_id uuid not null,
 council_id uuid,class_id uuid,include_descendants boolean not null default false,is_active boolean not null default true,
 created_at timestamptz not null default now(),check(num_nonnulls(council_id,class_id)=1),unique(organization_id,reference_number),
 foreign key(user_id,organization_id) references qarar_iam.user_submission_profiles_v2(user_id,organization_id) on delete restrict,
 foreign key(council_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
 foreign key(class_id,organization_id) references qarar_governance.governance_unit_classes(id,organization_id) on delete restrict);
create unique index active_user_submission_grant_v2 on qarar_iam.user_submission_grants_v2(user_id,coalesce(council_id,class_id)) where is_active;
alter table qarar_iam.user_submission_profiles_v2 enable row level security;
alter table qarar_iam.user_submission_profiles_v2 force row level security;
alter table qarar_iam.user_submission_grants_v2 enable row level security;
alter table qarar_iam.user_submission_grants_v2 force row level security;
revoke all on qarar_iam.user_submission_profiles_v2,qarar_iam.user_submission_grants_v2 from public,anon,authenticated,service_role;
grant select,insert,update on qarar_iam.user_submission_profiles_v2,qarar_iam.user_submission_grants_v2 to qarar_iam_executor;
grant select on qarar_core.governance_units,qarar_core.governance_unit_types,qarar_governance.governance_unit_classes to qarar_iam_executor;
grant execute on function qarar_governance.next_v2_reference(text) to qarar_iam_executor;

create function qarar_iam.actor_can_submit_scoped_v2(p_actor uuid,p_council uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 with recursive target as (
  select c.id,c.organization_id,c.scope_unit_id from qarar_core.governance_units c
  join qarar_core.governance_unit_types t on t.id=c.unit_type_id and t.organization_id=c.organization_id and t.is_council_type
  join qarar_iam.users u on u.id=p_actor and u.organization_id=c.organization_id and u.status='active'
  where c.id=p_council and c.status='active' and c.organization_id=qarar_iam.current_organization_id()
 ), ancestors as (
  select u.id,u.parent_unit_id,u.organization_id,0 depth,array[u.id] path from qarar_core.governance_units u join target t on t.scope_unit_id=u.id and t.organization_id=u.organization_id
  union all select u.id,u.parent_unit_id,u.organization_id,a.depth+1,a.path||u.id from qarar_core.governance_units u join ancestors a on u.id=a.parent_unit_id and u.organization_id=a.organization_id where not u.id=any(a.path)
 ) select exists(
  select 1 from target t join qarar_iam.user_submission_grants_v2 g on g.user_id=p_actor and g.organization_id=t.organization_id and g.is_active
  join qarar_core.governance_units root on root.organization_id=t.organization_id
  join qarar_core.governance_unit_types rt on rt.id=root.unit_type_id and rt.organization_id=root.organization_id and rt.is_council_type
  where (root.id=g.council_id or (root.governance_class_id=g.class_id and exists(select 1 from qarar_governance.governance_unit_classes cl where cl.id=g.class_id and cl.organization_id=g.organization_id and cl.is_active)))
  and (root.id=t.id or (g.include_descendants and root.scope_unit_id is not null and exists(select 1 from ancestors a where a.id=root.scope_unit_id and a.depth>0)))
 )
$$;

create function qarar_iam.get_user_submission_scope_v2(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then raise exception using errcode='42501',message='إدارة نطاق التقديم متاحة لمدير النظام فقط'; end if;
 if not exists(select 1 from qarar_iam.users where id=p_user_id and organization_id=o) then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 select jsonb_build_object('revision',coalesce(p.revision,0),'home_unit_id',p.home_unit_id,
 'rules',coalesce((select jsonb_agg(jsonb_build_object('kind',case when g.council_id is null then 'class' else 'council' end,'target_id',coalesce(g.council_id,g.class_id),'include_descendants',g.include_descendants) order by g.created_at,g.id) from qarar_iam.user_submission_grants_v2 g where g.user_id=p_user_id and g.organization_id=o and g.is_active),'[]'::jsonb)) into result
 from (select 1) x left join qarar_iam.user_submission_profiles_v2 p on p.user_id=p_user_id and p.organization_id=o;
 return result||jsonb_build_object(
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'parent_unit_id',u.parent_unit_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and not t.is_council_type),'[]'::jsonb),
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'scope_unit_id',u.scope_unit_id,'class_id',u.governance_class_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and t.is_council_type),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar) from qarar_governance.governance_unit_classes where organization_id=o and is_active),'[]'::jsonb));
end $$;

create function qarar_iam.save_user_submission_scope_v2(p_user_id uuid,p_expected_revision integer,p_home_unit_id uuid,p_rules jsonb,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); profile qarar_iam.user_submission_profiles_v2%rowtype; rule jsonb; target uuid; input jsonb; before_value jsonb;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then raise exception using errcode='42501',message='إدارة نطاق التقديم متاحة لمدير النظام فقط'; end if;
 perform 1 from qarar_iam.users where id=p_user_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules)>100 then raise exception using errcode='22023',message='إعداد نطاق التقديم غير صالح'; end if;
 if p_home_unit_id is not null and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.id=p_home_unit_id and u.organization_id=o and not t.is_council_type and u.status='active') then raise exception using errcode='23514',message='اختر جهة عمل تنظيمية نشطة داخل المؤسسة'; end if;
 input:=jsonb_build_object('home_unit_id',p_home_unit_id,'rules',p_rules);
 insert into qarar_iam.user_submission_profiles_v2(user_id,organization_id) values(p_user_id,o) on conflict(user_id) do nothing;
 select * into profile from qarar_iam.user_submission_profiles_v2 where user_id=p_user_id and organization_id=o for update;
 if profile.last_request_id=p_request_id then
  if profile.last_input is distinct from input then raise exception using errcode='40001',message='استُخدم طلب الحفظ نفسه لبيانات مختلفة'; end if;
  return jsonb_build_object('saved',true,'revision',profile.revision,'idempotent_replay',true);
 end if;
 if profile.revision<>p_expected_revision then raise exception using errcode='40001',message='تغير نطاق المستخدم؛ أعد تحميله قبل الحفظ'; end if;
 before_value:=qarar_iam.get_user_submission_scope_v2(p_user_id)-'units'-'councils'-'classes';
 for rule in select value from jsonb_array_elements(p_rules) loop
  if jsonb_typeof(rule) is distinct from 'object' or coalesce(rule->>'kind','') not in ('council','class') or jsonb_typeof(rule->'include_descendants') is distinct from 'boolean' or coalesce(rule->>'target_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='اختر مجالس أو مستويات صحيحة وحدد شمول التفرعات'; end if;
  target:=(rule->>'target_id')::uuid;
  if rule->>'kind'='council' and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type where u.id=target and u.organization_id=o and u.status<>'archived') then raise exception using errcode='23514',message='المجلس غير متاح في مؤسستك'; end if;
  if rule->>'kind'='class' and not exists(select 1 from qarar_governance.governance_unit_classes where id=target and organization_id=o and is_active) then raise exception using errcode='23514',message='مستوى المجالس غير متاح'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_rules) r group by r->>'kind',r->>'target_id' having count(*)>1) then raise exception using errcode='23514',message='لا تكرر النطاق نفسه'; end if;
 update qarar_iam.user_submission_grants_v2 set is_active=false where user_id=p_user_id and organization_id=o and is_active;
 insert into qarar_iam.user_submission_grants_v2(organization_id,user_id,reference_number,council_id,class_id,include_descendants)
 select o,p_user_id,qarar_governance.next_v2_reference('SPG'),case when r->>'kind'='council' then (r->>'target_id')::uuid end,case when r->>'kind'='class' then (r->>'target_id')::uuid end,(r->>'include_descendants')::boolean from jsonb_array_elements(p_rules) r;
 update qarar_iam.user_submission_profiles_v2 set home_unit_id=p_home_unit_id,revision=revision+1,last_request_id=p_request_id,last_input=input,updated_at=clock_timestamp(),updated_by=actor where user_id=p_user_id and organization_id=o returning * into profile;
 perform qarar_audit.append_audit_log(o,'iam.submission_scope.update','users',p_user_id,jsonb_build_object('before',before_value,'after',input,'revision',profile.revision,'request_id',p_request_id));
 return jsonb_build_object('saved',true,'revision',profile.revision,'idempotent_replay',false);
end $$;

alter function qarar_iam.actor_can_submit_scoped_v2(uuid,uuid) owner to qarar_iam_executor;
alter function qarar_iam.get_user_submission_scope_v2(uuid) owner to qarar_iam_executor;
alter function qarar_iam.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) owner to qarar_iam_executor;
revoke all on function qarar_iam.actor_can_submit_scoped_v2(uuid,uuid),qarar_iam.get_user_submission_scope_v2(uuid),qarar_iam.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.get_user_submission_scope_v2(uuid),qarar_iam.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) to qarar_api_executor;
create function api_v2.get_user_submission_scope_v2(p_user_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_iam.get_user_submission_scope_v2($1)$$;
create function api_v2.save_user_submission_scope_v2(p_user_id uuid,p_expected_revision integer,p_home_unit_id uuid,p_rules jsonb,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.save_user_submission_scope_v2($1,$2,$3,$4,$5)$$;
alter function api_v2.get_user_submission_scope_v2(uuid) owner to qarar_api_executor;
alter function api_v2.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) owner to qarar_api_executor;
revoke all on function api_v2.get_user_submission_scope_v2(uuid),api_v2.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function api_v2.get_user_submission_scope_v2(uuid),api_v2.save_user_submission_scope_v2(uuid,integer,uuid,jsonb,uuid) to authenticated;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('user_submission_profiles_v2','iam',false),('user_submission_grants_v2','iam',false);
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values('iam','qarar_governance','governance_unit_classes','Resolve explicit user submission scopes') on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values('iam','qarar_governance','next_v2_reference','p_entity_prefix text','Generate submission grant references') on conflict do nothing;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',p.proname='actor_can_submit_scoped_v2' from pg_proc p where p.pronamespace='qarar_iam'::regnamespace and p.proname in ('actor_can_submit_scoped_v2','get_user_submission_scope_v2','save_user_submission_scope_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_iam',p.proname,pg_get_function_identity_arguments(p.oid),'iam','authenticated' from pg_proc p where p.pronamespace='api_v2'::regnamespace and p.proname in ('get_user_submission_scope_v2','save_user_submission_scope_v2');
CREATE OR REPLACE FUNCTION qarar_iam.has_permission(permission_code text, target_unit_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(qarar_iam.is_system_admin(), false)
    or coalesce(exists(
      select 1
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
       and r.is_active
      join qarar_iam.role_permissions rp
        on rp.role_id = r.id
       and rp.organization_id = m.organization_id
       and rp.is_active
      join qarar_iam.permissions p
        on p.id = rp.permission_id
       and p.organization_id = m.organization_id
       and p.is_active
      where m.organization_id = qarar_iam.current_organization_id()
        and m.membership_status = 'active'
        and m.start_date <= current_date
        and (m.end_date is null or m.end_date >= current_date)
        and p.code = permission_code
        and (
          m.user_id = auth.uid()
          or exists(
            select 1
            from qarar_iam.access_delegations d
            where d.source_membership_id = m.id
              and d.organization_id = m.organization_id
              and d.delegated_to_user_id = auth.uid()
              and d.status = 'active'
              and now() between d.starts_at and d.ends_at
          )
        )
        and (
          p.context_scope in ('system', 'organization', 'self')
          or (
            target_unit_id is not null
            and m.governance_unit_id = target_unit_id
          )
        )
    ), false) or (permission_code='topics.create' and qarar_iam.actor_can_submit_scoped_v2(auth.uid(),target_unit_id));
$function$;
CREATE OR REPLACE FUNCTION qarar_iam.actor_has_permission(p_actor_user_id uuid, p_permission_code text, p_target_unit_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce((
    select u.is_system_admin
    from qarar_iam.users u
    where u.id = p_actor_user_id
      and u.status = 'active'
  ), false) or coalesce(exists (
    select 1
    from qarar_iam.memberships m
    join qarar_iam.roles r
      on r.id = m.role_id
     and r.organization_id = m.organization_id
     and r.is_active
    join qarar_iam.role_permissions rp
      on rp.role_id = r.id
     and rp.organization_id = r.organization_id
     and rp.is_active
    join qarar_iam.permissions p
      on p.id = rp.permission_id
     and p.organization_id = rp.organization_id
     and p.is_active
    join qarar_iam.users u
      on u.id = m.user_id
     and u.organization_id = m.organization_id
     and u.status = 'active'
    where m.user_id = p_actor_user_id
      and m.membership_status = 'active'
      and m.start_date <= current_date
      and (m.end_date is null or m.end_date >= current_date)
      and p.code = p_permission_code
      and (
        p.context_scope in ('system', 'organization', 'self')
        or (
          p_target_unit_id is not null
          and m.governance_unit_id = p_target_unit_id
        )
      )
  ), false) or (p_permission_code='topics.create' and qarar_iam.actor_can_submit_scoped_v2(p_actor_user_id,p_target_unit_id));
$function$;
CREATE OR REPLACE FUNCTION qarar_iam.get_current_user_access_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'user_id', u.id,
    'organization_id', u.organization_id,
    'organization_code', o.code,
    'organization_name_ar', o.name_ar,
    'full_name_ar', u.full_name_ar,
    'full_name_en', u.full_name_en,
    'email', u.email,
    'job_title', u.job_title,
    'is_system_admin', u.is_system_admin,
    'sso_provider_id', qarar_iam.current_sso_provider_id(),
    'roles', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'role_id', r.id,
        'code', r.code,
        'name_ar', r.name_ar,
        'scope', r.role_scope,
        'governance_unit_id', m.governance_unit_id,
        'membership_title', m.membership_title
      ))
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.code order by p.code)
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
      join qarar_iam.role_permissions rp
        on rp.role_id = r.id
       and rp.organization_id = m.organization_id
       and rp.is_active = true
      join qarar_iam.permissions p
        on p.id = rp.permission_id
       and p.organization_id = m.organization_id
       and p.is_active = true
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb) || case when exists(select 1 from qarar_core.governance_units gu where gu.organization_id=u.organization_id and qarar_iam.actor_can_submit_scoped_v2(u.id,gu.id)) then '["topics.create"]'::jsonb else '[]'::jsonb end
  )
  from qarar_iam.users u
  join qarar_core.organizations o on o.id = u.organization_id
  where u.id = auth.uid()
    and u.status = 'active';
$function$;
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v2'),contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v2' join qarar_architecture.api_contract_registry c on c.api_version='v2' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v2';
notify pgrst,'reload schema';
commit;
