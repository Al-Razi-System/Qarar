begin;

create or replace function qarar_iam.admin_add_council_member(
 p_council_id uuid,p_user_id uuid,p_role_id uuid,p_membership_title text,
 p_start_date date,p_end_date date
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare
 o uuid:=qarar_iam.current_organization_id();
 v_id uuid;
 changed timestamptz;
 conflict_role text;
 conflict_start date;
 conflict_end date;
begin
 perform qarar_iam.assert_permission('governance.memberships.manage',p_council_id);
 if p_start_date is null or(p_end_date is not null and p_end_date<p_start_date)
 then raise exception using errcode='22023',message='فترة العضوية غير صالحة';end if;
 if not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t
  on t.id=u.unit_type_id and t.organization_id=u.organization_id
  where u.id=p_council_id and u.organization_id=o and u.status<>'archived' and t.is_council_type)
 then raise exception using errcode='P0002',message='المجلس غير موجود أو مؤرشف';end if;
 if not exists(select 1 from qarar_iam.users where id=p_user_id and organization_id=o and status='active')
 then raise exception using errcode='23503',message='المستخدم غير موجود أو غير نشط';end if;
 if not exists(select 1 from qarar_iam.roles where id=p_role_id and organization_id=o
  and is_active and role_scope='governance_unit')
 then raise exception using errcode='23503',message='الدور غير موجود أو غير نشط';end if;

 select r.name_ar,m.start_date,m.end_date
 into conflict_role,conflict_start,conflict_end
 from qarar_iam.memberships m
 join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
 where m.organization_id=o and m.user_id=p_user_id
   and m.governance_unit_id=p_council_id and m.role_id=p_role_id
   and daterange(m.start_date,coalesce(m.end_date+1,'infinity'::date),'[)') &&
       daterange(p_start_date,coalesce(p_end_date+1,'infinity'::date),'[)')
 order by m.start_date desc limit 1;
 if conflict_role is not null then
   raise exception using errcode='23P01',message=format(
    'لا يمكن إضافة العضوية: توجد فترة متداخلة للدور «%s» من %s إلى %s. غيّر تاريخ البداية أو أنهِ العضوية السابقة أولاً.',
    conflict_role,to_char(conflict_start,'YYYY-MM-DD'),coalesce(to_char(conflict_end,'YYYY-MM-DD'),'مستمرة'));
 end if;

 begin
  insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,
   membership_title,membership_status,start_date,end_date)
  values(o,p_user_id,p_council_id,p_role_id,nullif(btrim(p_membership_title),''),
   'active',p_start_date,p_end_date)returning memberships.id,updated_at into v_id,changed;
 exception when exclusion_violation or unique_violation then
  raise exception using errcode='23P01',message='تعذر إضافة العضوية بسبب تعارض متزامن. حدّث بيانات المجلس ثم أعد المحاولة.';
 end;
 perform qarar_audit.append_audit_log(o,'council.membership.added','membership',v_id,
  jsonb_build_object('council_id',p_council_id,'user_id',p_user_id,'role_id',p_role_id,
   'start_date',p_start_date,'end_date',p_end_date));
 return jsonb_build_object('id',v_id,'membership_status','active','updated_at',changed);
end $$;

alter function qarar_iam.admin_add_council_member(uuid,uuid,uuid,text,date,date) owner to qarar_iam_executor;
notify pgrst,'reload schema';
commit;
