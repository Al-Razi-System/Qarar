begin;
create extension if not exists btree_gist;

alter table qarar_iam.memberships
 add constraint memberships_no_overlapping_periods
 exclude using gist(
  organization_id with =,user_id with =,governance_unit_id with =,role_id with =,
  daterange(start_date,coalesce(end_date+1,'infinity'::date),'[)') with &&
 );

create or replace function qarar_iam.admin_list_council_members(
 p_council_id uuid,p_include_ended boolean default false,p_limit integer default 50,p_offset integer default 0
)returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_iam as $$
declare o uuid:=qarar_iam.current_organization_id();l integer:=least(greatest(coalesce(p_limit,50),1),100);f integer:=greatest(coalesce(p_offset,0),0);
begin
 perform qarar_iam.assert_permission('governance.policies.manage',p_council_id);
 if not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t
  on t.id=u.unit_type_id and t.organization_id=u.organization_id
  where u.id=p_council_id and u.organization_id=o and t.is_council_type)
 then raise exception using errcode='P0002',message='المجلس غير موجود';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)order by x.start_date desc,x.id)from(
  select m.id,m.user_id,u.full_name_ar,u.full_name_en,m.role_id,r.code role_code,r.name_ar role_name_ar,
   m.membership_title,m.membership_status,m.start_date,m.end_date,m.created_at,m.updated_at,
   (m.membership_status='active' and m.start_date<=current_date and(m.end_date is null or m.end_date>=current_date))is_effective
  from qarar_iam.memberships m join qarar_iam.users u on u.id=m.user_id and u.organization_id=m.organization_id
  join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
  where m.organization_id=o and m.governance_unit_id=p_council_id
   and(p_include_ended or(m.membership_status='active' and(m.end_date is null or m.end_date>=current_date)))
  order by m.start_date desc,m.id limit l offset f)x),'[]'::jsonb),
  'total',(select count(*)::integer from qarar_iam.memberships m where m.organization_id=o
   and m.governance_unit_id=p_council_id and(p_include_ended or(m.membership_status='active' and(m.end_date is null or m.end_date>=current_date)))),
  'limit',l,'offset',f);
end $$;

create or replace function qarar_iam.admin_add_council_member(
 p_council_id uuid,p_user_id uuid,p_role_id uuid,p_membership_title text,
 p_start_date date,p_end_date date
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare o uuid:=qarar_iam.current_organization_id();v_id uuid;changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',p_council_id);
 if p_start_date is null or(p_end_date is not null and p_end_date<p_start_date)
 then raise exception using errcode='22023',message='فترة العضوية غير صالحة';end if;
 if not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t
  on t.id=u.unit_type_id and t.organization_id=u.organization_id
  where u.id=p_council_id and u.organization_id=o and u.status<>'archived' and t.is_council_type)
 then raise exception using errcode='P0002',message='المجلس غير موجود أو مؤرشف';end if;
 if not exists(select 1 from qarar_iam.users where id=p_user_id and organization_id=o and status='active')
 then raise exception using errcode='23503',message='المستخدم غير موجود أو غير نشط';end if;
 if not exists(select 1 from qarar_iam.roles where id=p_role_id and organization_id=o and is_active)
 then raise exception using errcode='23503',message='الدور غير موجود أو غير نشط';end if;
 insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,
  membership_title,membership_status,start_date,end_date)
 values(o,p_user_id,p_council_id,p_role_id,nullif(btrim(p_membership_title),''),
  'active',p_start_date,p_end_date)returning memberships.id,updated_at into v_id,changed;
 perform qarar_audit.append_audit_log(o,'council.membership.added','membership',v_id,
  jsonb_build_object('council_id',p_council_id,'user_id',p_user_id,'role_id',p_role_id,
   'start_date',p_start_date,'end_date',p_end_date));
 return jsonb_build_object('id',v_id,'membership_status','active','updated_at',changed);
exception when exclusion_violation or unique_violation then
 raise exception using errcode='23P01',message='توجد عضوية متداخلة للمستخدم والدور في المجلس';
end $$;

create or replace function qarar_iam.admin_update_council_membership(
 p_membership_id uuid,p_membership_title text,p_start_date date,p_end_date date,
 p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare o uuid:=qarar_iam.current_organization_id();unit_id uuid;changed timestamptz;
begin
 select governance_unit_id into unit_id from qarar_iam.memberships where id=p_membership_id and organization_id=o;
 if unit_id is null then raise exception using errcode='P0002',message='العضوية غير موجودة';end if;
 perform qarar_iam.assert_permission('governance.policies.manage',unit_id);
 if p_start_date is null or(p_end_date is not null and p_end_date<p_start_date)
 then raise exception using errcode='22023',message='فترة العضوية غير صالحة';end if;
 update qarar_iam.memberships set membership_title=nullif(btrim(p_membership_title),''),
  start_date=p_start_date,end_date=p_end_date
 where id=p_membership_id and organization_id=o and membership_status='active'
  and updated_at=p_expected_updated_at returning updated_at into changed;
 if changed is null then raise exception using errcode='40001',message='تم تعديل العضوية أو إنهاؤها؛ حدّث البيانات';end if;
 perform qarar_audit.append_audit_log(o,'council.membership.updated','membership',p_membership_id,
  jsonb_build_object('start_date',p_start_date,'end_date',p_end_date));
 return jsonb_build_object('id',p_membership_id,'updated_at',changed);
exception when exclusion_violation or unique_violation then
 raise exception using errcode='23P01',message='توجد عضوية متداخلة للمستخدم والدور في المجلس';
end $$;

create or replace function qarar_iam.admin_end_council_membership(
 p_membership_id uuid,p_end_date date,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare o uuid:=qarar_iam.current_organization_id();unit_id uuid;started date;changed timestamptz;
begin
 select governance_unit_id,start_date into unit_id,started from qarar_iam.memberships
 where id=p_membership_id and organization_id=o;
 if unit_id is null then raise exception using errcode='P0002',message='العضوية غير موجودة';end if;
 perform qarar_iam.assert_permission('governance.policies.manage',unit_id);
 if p_end_date is null or p_end_date<started or nullif(btrim(p_reason),'') is null
 then raise exception using errcode='22023',message='تاريخ وسبب الإنهاء مطلوبان وصالحان';end if;
 update qarar_iam.memberships set membership_status='ended',end_date=p_end_date
 where id=p_membership_id and organization_id=o and membership_status='active'
  and updated_at=p_expected_updated_at returning updated_at into changed;
 if changed is null then raise exception using errcode='40001',message='تم تعديل العضوية أو إنهاؤها؛ حدّث البيانات';end if;
 perform qarar_audit.append_audit_log(o,'council.membership.ended','membership',p_membership_id,
  jsonb_build_object('end_date',p_end_date,'reason',btrim(p_reason)));
 return jsonb_build_object('id',p_membership_id,'membership_status','ended','end_date',p_end_date,'updated_at',changed);
end $$;

alter function qarar_iam.admin_list_council_members(uuid,boolean,integer,integer) owner to qarar_iam_executor;
alter function qarar_iam.admin_add_council_member(uuid,uuid,uuid,text,date,date) owner to qarar_iam_executor;
alter function qarar_iam.admin_update_council_membership(uuid,text,date,date,timestamptz) owner to qarar_iam_executor;
alter function qarar_iam.admin_end_council_membership(uuid,date,text,timestamptz) owner to qarar_iam_executor;
revoke all on function qarar_iam.admin_list_council_members(uuid,boolean,integer,integer) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.admin_add_council_member(uuid,uuid,uuid,text,date,date) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.admin_update_council_membership(uuid,text,date,date,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_iam.admin_end_council_membership(uuid,date,text,timestamptz) from public,anon,authenticated,service_role;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)values
('iam','qarar_core','governance_unit_types','Validate that membership targets are council-compatible')
on conflict do nothing;
grant usage on schema qarar_core to qarar_iam_executor;
grant select on qarar_core.governance_units,qarar_core.governance_unit_types to qarar_iam_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam' and p.proname in('admin_list_council_members','admin_add_council_member',
 'admin_update_council_membership','admin_end_council_membership')
on conflict(function_name,identity_arguments)do update set function_oid=excluded.function_oid,module_code='iam',owning_schema='qarar_iam';

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)values
('v1','admin_list_council_members','qarar_iam','admin_list_council_members',
 'p_council_id uuid, p_include_ended boolean, p_limit integer, p_offset integer','iam','authenticated'),
('v1','admin_add_council_member','qarar_iam','admin_add_council_member',
 'p_council_id uuid, p_user_id uuid, p_role_id uuid, p_membership_title text, p_start_date date, p_end_date date','iam','authenticated'),
('v1','admin_update_council_membership','qarar_iam','admin_update_council_membership',
 'p_membership_id uuid, p_membership_title text, p_start_date date, p_end_date date, p_expected_updated_at timestamp with time zone','iam','authenticated'),
('v1','admin_end_council_membership','qarar_iam','admin_end_council_membership',
 'p_membership_id uuid, p_end_date date, p_reason text, p_expected_updated_at timestamp with time zone','iam','authenticated')
on conflict do nothing;

do $$
declare c record;p record;args text;s text;
begin for c in select * from qarar_architecture.api_contract_registry where contract_name in(
 'admin_list_council_members','admin_add_council_member','admin_update_council_membership','admin_end_council_membership')
loop select x.oid,pg_get_function_arguments(x.oid)a,pg_get_function_result(x.oid)r into p
 from pg_proc x join pg_namespace n on n.oid=x.pronamespace where n.nspname='qarar_iam'
 and x.proname=c.implementation_name and pg_get_function_identity_arguments(x.oid)=c.identity_arguments;
 select string_agg(split_part(btrim(v),' ',1),',' order by ord)into args
 from unnest(string_to_array(c.identity_arguments,','))with ordinality z(v,ord);
 s:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$select qarar_iam.%I(%s)$f$',
 c.contract_name,p.a,p.r,c.implementation_name,args);execute s;
 execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
 execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
 execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
 execute format('grant usage on schema qarar_iam to qarar_api_executor');
 execute format('grant execute on function qarar_iam.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
end loop;end $$;

update qarar_architecture.api_release_registry
set contract_count=134,contract_hash='79c30287b41fb24e4658298da2db8a92',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 PB-076 adds temporal council membership contracts.'
where api_version='v1';

commit;
