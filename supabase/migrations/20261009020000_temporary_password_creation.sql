begin;
alter table qarar_iam.users
 add column must_change_password boolean not null default false,
 add column require_live_auth_session boolean not null default false,
 add column temporary_password_hash text,
 add column password_change_claim uuid,
 add column password_change_claim_until timestamptz,
 add column password_change_receipt uuid,
 add constraint temporary_password_baseline_check check(must_change_password=(temporary_password_hash is not null)),
 add constraint temporary_password_claim_check check((password_change_claim is null)=(password_change_claim_until is null));

create or replace function qarar_iam.current_organization_id()
returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select u.organization_id from qarar_iam.users u where u.id=auth.uid() and u.status='active'
 and not u.must_change_password and (not u.require_live_auth_session or exists(
  select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')) limit 1
$$;
create or replace function qarar_iam.is_system_admin()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select u.is_system_admin from qarar_iam.users u where u.id=auth.uid()
 and u.status='active' and u.organization_id=qarar_iam.current_organization_id() limit 1),false)
$$;

-- The existing trusted service normalization must also preserve a live actor
-- session for accounts created by the new flow. Existing JWT-less fixtures and
-- accounts retain their compatibility because require_live_auth_session=false.
create or replace function qarar_iam.service_finalize_invited_user(
 p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,
 p_employee_no text default null,p_mobile text default null,p_job_title text default null,
 p_role_id uuid default null,p_governance_unit_id uuid default null,p_membership_title text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare old_claim text; old_claims text; old_sub text; old_role text; actor_claims text; result jsonb;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 if not qarar_iam.actor_has_permission(p_actor_user_id,'iam.users.manage',null) then raise exception using errcode='42501',message='permission denied'; end if;
 old_claim:=current_setting('request.jwt.claim',true); old_claims:=current_setting('request.jwt.claims',true);
 old_sub:=current_setting('request.jwt.claim.sub',true); old_role:=current_setting('request.jwt.claim.role',true);
 actor_claims:=jsonb_build_object('sub',p_actor_user_id,'role','authenticated','session_id',
  (select s.id from auth.sessions s where s.user_id=p_actor_user_id order by s.created_at desc limit 1))::text;
 perform set_config('request.jwt.claim',actor_claims,true); perform set_config('request.jwt.claims',actor_claims,true);
 perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  result:=qarar_iam.admin_finalize_invited_user(p_auth_user_id,p_email,p_full_name_ar,p_employee_no,p_mobile,p_job_title,p_role_id,p_governance_unit_id,p_membership_title);
 exception when others then
  perform set_config('request.jwt.claim',coalesce(old_claim,''),true); perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); perform set_config('request.jwt.claim.role',coalesce(old_role,''),true); raise;
 end;
 perform set_config('request.jwt.claim',coalesce(old_claim,''),true); perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); perform set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 return result;
end $$;

create function qarar_iam.service_finalize_temporary_user(
 p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,
 p_employee_no text default null,p_mobile text default null,p_job_title text default null,
 p_role_id uuid default null,p_governance_unit_id uuid default null,p_membership_title text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; baseline text; o uuid;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 select organization_id into o from qarar_iam.users where id=p_actor_user_id and status='active' and is_system_admin and not must_change_password;
 if o is null then raise exception using errcode='42501',message='إنشاء الحساب المباشر متاح لمدير النظام فقط'; end if;
 select encrypted_password into baseline from auth.users where id=p_auth_user_id and lower(email)=lower(p_email);
 if nullif(baseline,'') is null then raise exception using errcode='22023',message='الهوية الجديدة غير مكتملة'; end if;
 result:=qarar_iam.service_finalize_invited_user(p_actor_user_id,p_auth_user_id,p_email,p_full_name_ar,p_employee_no,p_mobile,p_job_title,p_role_id,p_governance_unit_id,p_membership_title);
 update qarar_iam.users set must_change_password=true,temporary_password_hash=baseline where id=p_auth_user_id and organization_id=o;
 if not found then raise exception using errcode='42501',message='المستخدم خارج المؤسسة'; end if;
 insert into qarar_audit.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(o,p_actor_user_id,'iam.temporary_password.create','users',p_auth_user_id,'{"must_change_password":true}'::jsonb);
 return result||jsonb_build_object('must_change_password',true,'status','active');
end $$;
create function qarar_iam.service_get_temporary_password_state(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 select jsonb_build_object('user_id',id,'must_change_password',must_change_password,'expires_at',created_at+interval '7 days') into result
 from qarar_iam.users where id=p_user_id and status='active';
 if result is null then raise exception using errcode='42501',message='الحساب غير متاح'; end if;
 return result;
end $$;
create function qarar_iam.service_claim_temporary_password(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u qarar_iam.users%rowtype;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='معرف المحاولة مطلوب'; end if;
 select * into u from qarar_iam.users where id=p_user_id for update;
 if not found or u.status<>'active' or not u.must_change_password or u.created_at+interval '7 days'<clock_timestamp() then
  raise exception using errcode='42501',message='جلسة الاستبدال غير صالحة أو انتهت صلاحيتها'; end if;
 if u.password_change_claim is not null and u.password_change_claim_until>clock_timestamp() then
  raise exception using errcode='40001',message='توجد محاولة استبدال جارية؛ انتظر قبل المحاولة'; end if;
 update qarar_iam.users set password_change_claim=p_request_id,password_change_claim_until=clock_timestamp()+interval '5 minutes' where id=p_user_id;
 return jsonb_build_object('claimed',true);
end $$;
create function qarar_iam.service_release_temporary_password(p_user_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 update qarar_iam.users set password_change_claim=null,password_change_claim_until=null
 where id=p_user_id and password_change_claim=p_request_id and must_change_password;
end $$;
create function qarar_iam.service_finish_temporary_password(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare u qarar_iam.users%rowtype; baseline text;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required'; end if;
 select * into u from qarar_iam.users where id=p_user_id for update;
 if not found or u.status<>'active' then raise exception using errcode='42501',message='الحساب غير متاح'; end if;
 if u.password_change_receipt=p_request_id and not u.must_change_password then return jsonb_build_object('completed',true,'replay',true); end if;
 if not u.must_change_password or u.password_change_claim is distinct from p_request_id or u.password_change_claim_until<clock_timestamp() then
  raise exception using errcode='40001',message='محاولة الاستبدال غير متاحة'; end if;
 select encrypted_password into baseline from auth.users where id=p_user_id;
 if baseline is null or baseline=u.temporary_password_hash then raise exception using errcode='22023',message='اختر كلمة مرور مختلفة عن المؤقتة'; end if;
 perform qarar_iam.service_revoke_auth_sessions(p_user_id,p_user_id,null,'temporary password replaced');
 update qarar_iam.users set must_change_password=false,require_live_auth_session=true,temporary_password_hash=null,
 password_change_claim=null,password_change_claim_until=null,password_change_receipt=p_request_id where id=p_user_id;
 insert into qarar_audit.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(u.organization_id,p_user_id,'iam.temporary_password.complete','users',p_user_id,jsonb_build_object('request_id',p_request_id));
 return jsonb_build_object('completed',true,'replay',false);
end $$;

create function api_v1.service_finalize_temporary_user(p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,p_employee_no text default null,p_mobile text default null,p_job_title text default null,p_role_id uuid default null,p_governance_unit_id uuid default null,p_membership_title text default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_finalize_temporary_user($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$$;
create function api_v1.service_get_temporary_password_state(p_user_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_iam.service_get_temporary_password_state($1)$$;
create function api_v1.service_claim_temporary_password(p_user_id uuid,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_claim_temporary_password($1,$2)$$;
create function api_v1.service_release_temporary_password(p_user_id uuid,p_request_id uuid) returns void language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_release_temporary_password($1,$2)$$;
create function api_v1.service_finish_temporary_password(p_user_id uuid,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.service_finish_temporary_password($1,$2)$$;
do $$declare routine record; signature text; begin
 for routine in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('qarar_iam','api_v1') and p.proname in ('service_finalize_temporary_user','service_get_temporary_password_state','service_claim_temporary_password','service_release_temporary_password','service_finish_temporary_password') loop
  signature:=format('%I.%I(%s)',routine.nspname,routine.proname,routine.args);
  execute 'alter function '||signature||' owner to '||case when routine.nspname='api_v1' then 'qarar_api_executor' else 'qarar_iam_executor' end;
  execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
  execute 'grant execute on function '||signature||' to '||case when routine.nspname='api_v1' then 'service_role' else 'qarar_api_executor' end;
 end loop;
end $$;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p where p.pronamespace='qarar_iam'::regnamespace and p.proname in ('service_finalize_temporary_user','service_get_temporary_password_state','service_claim_temporary_password','service_release_temporary_password','service_finish_temporary_password');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v1',p.proname,'qarar_iam',p.proname,pg_get_function_identity_arguments(p.oid),'iam','service_role' from pg_proc p where p.pronamespace='api_v1'::regnamespace and p.proname in ('service_finalize_temporary_user','service_get_temporary_password_state','service_claim_temporary_password','service_release_temporary_password','service_finish_temporary_password');
notify pgrst,'reload schema';
commit;
