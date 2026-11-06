begin;
create table qarar_iam.user_avatars_v2 (
 user_id uuid primary key, organization_id uuid not null,
 content bytea, revision integer not null default 0 check(revision>=0),
 last_request_id uuid, updated_at timestamptz not null default now(),
 foreign key(user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
 check(content is null or (octet_length(content) between 4 and 524288 and substring(content from 1 for 3)=decode('ffd8ff','hex')))
);
alter table qarar_iam.user_avatars_v2 enable row level security;
alter table qarar_iam.user_avatars_v2 force row level security;
revoke all on qarar_iam.user_avatars_v2 from public,anon,authenticated,service_role;
grant select,insert,update on qarar_iam.user_avatars_v2 to qarar_iam_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('user_avatars_v2','iam',false);

create function qarar_iam.get_my_avatar_v2(p_include_content boolean default false)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 if auth.uid() is null or o is null or not exists(select 1 from qarar_iam.users where id=auth.uid() and organization_id=o and status='active' and not must_change_password) then
  raise exception using errcode='42501',message='سجّل الدخول بحساب نشط لعرض صورتك';
 end if;
 select jsonb_build_object('revision',coalesce(a.revision,0),'has_image',a.content is not null,
 'content_base64',case when p_include_content then encode(a.content,'base64') else null end)
 into result from (select 1) x left join qarar_iam.user_avatars_v2 a on a.user_id=auth.uid() and a.organization_id=o;
 return result;
end $$;

create function qarar_iam.set_my_avatar_v2(p_content_base64 text,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); a qarar_iam.user_avatars_v2%rowtype; bytes bytea;
begin
 if auth.uid() is null or o is null then raise exception using errcode='42501',message='سجّل الدخول لتحديث صورتك'; end if;
 perform 1 from qarar_iam.users where id=auth.uid() and organization_id=o and status='active' and not must_change_password for update;
 if not found then raise exception using errcode='42501',message='تحديث الصورة متاح لحساب نشط فقط'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception using errcode='22023',message='طلب تحديث الصورة غير صالح'; end if;
 if p_content_base64 is not null then
  if length(p_content_base64)>720000 then raise exception using errcode='22023',message='الصورة أكبر من الحد المسموح'; end if;
  begin bytes:=decode(p_content_base64,'base64'); exception when others then raise exception using errcode='22023',message='بيانات الصورة غير صالحة'; end;
  if octet_length(bytes) not between 4 and 524288 or substring(bytes from 1 for 3)<>decode('ffd8ff','hex') then raise exception using errcode='22023',message='بيانات الصورة غير صالحة'; end if;
 end if;
 insert into qarar_iam.user_avatars_v2(user_id,organization_id) values(auth.uid(),o) on conflict(user_id) do nothing;
 select * into a from qarar_iam.user_avatars_v2 where user_id=auth.uid() and organization_id=o for update;
 if a.last_request_id=p_request_id then
  if a.content is distinct from bytes or a.revision<>p_expected_revision+1 then raise exception using errcode='40001',message='استُخدم الطلب لبيانات مختلفة؛ أعد تحميل صورتك'; end if;
  return jsonb_build_object('saved',true,'revision',a.revision,'has_image',a.content is not null);
 end if;
 if a.revision<>p_expected_revision then raise exception using errcode='40001',message='تغيرت صورتك في صفحة أخرى؛ أعد تحميلها قبل التعديل'; end if;
 update qarar_iam.user_avatars_v2 set content=bytes,revision=revision+1,last_request_id=p_request_id,updated_at=clock_timestamp() where user_id=auth.uid() and organization_id=o returning * into a;
 perform qarar_audit.append_audit_log(o,case when bytes is null then 'iam.self.avatar_remove' else 'iam.self.avatar_update' end,'users',auth.uid(),jsonb_build_object('revision',a.revision,'request_id',p_request_id));
 return jsonb_build_object('saved',true,'revision',a.revision,'has_image',a.content is not null);
end $$;
alter function qarar_iam.get_my_avatar_v2(boolean) owner to qarar_iam_executor;
alter function qarar_iam.set_my_avatar_v2(text,integer,uuid) owner to qarar_iam_executor;
revoke all on function qarar_iam.get_my_avatar_v2(boolean),qarar_iam.set_my_avatar_v2(text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.get_my_avatar_v2(boolean),qarar_iam.set_my_avatar_v2(text,integer,uuid) to qarar_api_executor;
create function api_v2.get_my_avatar_v2(p_include_content boolean default false) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.get_my_avatar_v2($1)$$;
create function api_v2.set_my_avatar_v2(p_content_base64 text,p_expected_revision integer,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.set_my_avatar_v2($1,$2,$3)$$;
alter function api_v2.get_my_avatar_v2(boolean) owner to qarar_api_executor;
alter function api_v2.set_my_avatar_v2(text,integer,uuid) owner to qarar_api_executor;
revoke all on function api_v2.get_my_avatar_v2(boolean),api_v2.set_my_avatar_v2(text,integer,uuid) from public,anon,service_role;
grant execute on function api_v2.get_my_avatar_v2(boolean),api_v2.set_my_avatar_v2(text,integer,uuid) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p where p.pronamespace='qarar_iam'::regnamespace and p.proname in ('get_my_avatar_v2','set_my_avatar_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_iam',p.proname,pg_get_function_identity_arguments(p.oid),'iam','authenticated' from pg_proc p where p.pronamespace='api_v2'::regnamespace and p.proname in ('get_my_avatar_v2','set_my_avatar_v2');
notify pgrst,'reload schema';
commit;
