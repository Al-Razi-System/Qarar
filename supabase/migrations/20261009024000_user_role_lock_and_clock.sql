begin;
create or replace function qarar_iam.manage_user_role_v2(p_user_id uuid,p_action text,p_membership_id uuid default null,p_expected_updated_at timestamptz default null,p_role_id uuid default null,p_unit_id uuid default null,p_title text default null,p_start_date date default current_date,p_end_date date default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); m qarar_iam.memberships%rowtype; payload jsonb; role_code text; is_council boolean;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then raise exception using errcode='42501',message='إدارة الأدوار متاحة لمدير النظام فقط'; end if;
 if p_action not in ('add','update','disable','enable') or p_action is null then raise exception using errcode='22023',message='عملية الأدوار غير صالحة'; end if;
 perform qarar_iam.lock_iam_authority_boundary(o);
 perform pg_advisory_xact_lock(hashtextextended(o::text||':unit-hierarchy',0));
 perform 1 from qarar_iam.users where id=p_user_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 payload:=jsonb_build_object('user_id',p_user_id,'role_id',p_role_id,'unit_id',p_unit_id,'title',nullif(btrim(p_title),''),'start_date',p_start_date,'end_date',p_end_date);
 if p_action='add' then
  if p_request_id is null or p_membership_id is not null then raise exception using errcode='22023',message='طلب إضافة الدور غير صالح'; end if;
  select * into m from qarar_iam.memberships where organization_id=o and management_request_id=p_request_id;
  if found then
   if m.user_id<>p_user_id or m.management_request_input<>payload then raise exception using errcode='40001',message='طلب الإضافة استُخدم لبيانات مختلفة'; end if;
   return jsonb_build_object('saved',true,'membership_id',m.id,'idempotent_replay',true);
  end if;
 else
  select * into m from qarar_iam.memberships where id=p_membership_id and organization_id=o and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='الدور غير موجود لهذا المستخدم'; end if;
  if m.membership_status='ended' then raise exception using errcode='23514',message='العضوية منتهية؛ أضف فترة جديدة بدل تغيير تاريخها'; end if;
  if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='تغيّرت الأدوار منذ فتحها؛ حدّث القائمة قبل الحفظ'; end if;
 end if;
 if p_action in ('add','update','enable') then
  if p_action='enable' then p_role_id:=m.role_id; p_unit_id:=m.governance_unit_id; p_start_date:=m.start_date; p_end_date:=m.end_date; end if;
  select r.code into role_code from qarar_iam.roles r where r.id=p_role_id and r.organization_id=o and r.is_active for share;
  if not found then raise exception using errcode='23514',message='الدور غير نشط أو غير متاح في مؤسستك'; end if;
  select t.is_council_type into is_council from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.organization_id=g.organization_id where g.id=p_unit_id and g.organization_id=o and t.is_active and (g.status='active' or (t.is_council_type and g.status='inactive'));
  if not found or (left(role_code,8)='council_' and not is_council) then raise exception using errcode='23514',message='اختر مجلسًا أو جهة متاحة تناسب الدور'; end if;
  if p_start_date is null or (p_end_date is not null and p_end_date<p_start_date) or (p_action='enable' and p_end_date<current_date) then raise exception using errcode='23514',message='فترة الدور غير صالحة؛ عدّل السريان أولًا'; end if;
  if length(coalesce(p_title,''))>500 then raise exception using errcode='22023',message='صفة الدور طويلة جدًا'; end if;
 end if;
 begin
  if p_action='add' then
   insert into qarar_iam.memberships(organization_id,user_id,role_id,governance_unit_id,membership_title,start_date,end_date,management_request_id,management_request_input)
   values(o,p_user_id,p_role_id,p_unit_id,nullif(btrim(p_title),''),p_start_date,p_end_date,p_request_id,payload) returning * into m;
  elsif p_action='update' then
   update qarar_iam.memberships set role_id=p_role_id,governance_unit_id=p_unit_id,membership_title=nullif(btrim(p_title),''),start_date=p_start_date,end_date=p_end_date where id=m.id and organization_id=o returning * into m;
  else
   update qarar_iam.memberships set membership_status=case when p_action='disable' then 'inactive' else 'active' end where id=m.id and organization_id=o returning * into m;
  end if;
 exception when exclusion_violation or unique_violation then
  raise exception using errcode='23P01',message='يوجد دور أو قيادة متعارضة في الفترة نفسها؛ حدّث الأدوار قبل المتابعة';
 end;
 perform qarar_audit.append_audit_log(o,'iam.user_role.'||p_action,'memberships',m.id,jsonb_build_object('user_id',p_user_id,'role_id',m.role_id,'unit_id',m.governance_unit_id,'status',m.membership_status));
 return jsonb_build_object('saved',true,'membership_id',m.id,'updated_at',m.updated_at,'idempotent_replay',false);
end $$;

create function qarar_iam.set_membership_change_clock_v2() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.updated_at:=clock_timestamp(); return new; end $$;
alter function qarar_iam.set_membership_change_clock_v2() owner to qarar_iam_executor;
revoke all on function qarar_iam.set_membership_change_clock_v2() from public,anon,authenticated,service_role;
create trigger zz_membership_change_clock_v2 before update on qarar_iam.memberships for each row execute function qarar_iam.set_membership_change_clock_v2();
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p where p.pronamespace='qarar_iam'::regnamespace and p.proname='set_membership_change_clock_v2';
commit;
