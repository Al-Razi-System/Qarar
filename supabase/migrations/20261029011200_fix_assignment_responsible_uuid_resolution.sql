-- PostgreSQL has no min(uuid); compare the text form and cast the sole candidate back.
begin;
create or replace function qarar_meetings.preview_meeting_assignment_targets(p_agenda_item_id uuid,p_selections jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_meeting_id uuid;v_ctx jsonb;
begin
  select meeting_id into v_meeting_id from qarar_meetings.agenda_items
  where id=p_agenda_item_id and organization_id=v_org;
  if v_meeting_id is null then raise exception using errcode='P0002',message='بند الاجتماع غير موجود.';end if;
  v_ctx:=qarar_meetings.assignment_context(v_meeting_id);
  if not(coalesce((v_ctx->>'chair')::boolean,false) or coalesce((v_ctx->>'rapporteur')::boolean,false)) then
    raise exception using errcode='42501',message='معاينة مستهدفي التكليف متاحة لرئيس المجلس ومقرره.';
  end if;
  if jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections) not between 1 and 200 then
    raise exception using errcode='22023',message='اختر مستهدفاً واحداً على الأقل، وبحد أقصى 200.';
  end if;
  with recursive selections as(
    select x.kind,x.id,x.scope_unit_id from jsonb_to_recordset(p_selections) x(kind text,id uuid,scope_unit_id uuid)
  ), descendants as(
    select g.id,g.parent_unit_id,g.unit_type_id from qarar_core.governance_units g,selections s
    where s.kind='unit_type' and s.scope_unit_id is not null and g.id=s.scope_unit_id and g.organization_id=v_org
    union all
    select c.id,c.parent_unit_id,c.unit_type_id from qarar_core.governance_units c join descendants p on c.parent_unit_id=p.id
    where c.organization_id=v_org and c.status='active'
  ), raw_targets as(
    select 'user'::text target_kind,s.id target_user_id,null::uuid target_unit_id,'user'::text selection_kind,null::uuid source_type,null::uuid source_scope from selections s where s.kind='user'
    union all select 'unit',null,s.id,'unit',null,null from selections s where s.kind='unit'
    union all
    select 'unit',null,g.id,'unit_type',s.id,s.scope_unit_id from selections s join qarar_core.governance_units g
      on s.kind='unit_type' and g.organization_id=v_org and g.status='active' and g.unit_type_id=s.id
      and (s.scope_unit_id is null or g.id in(select id from descendants))
  ), targets as(select distinct * from raw_targets), resolved as(
    select t.*,coalesce(t.target_user_id,leader.user_id) resolved_user_id,
      u.full_name_ar resolved_user_name_ar,gu.name_ar resolved_unit_name_ar,
      case when t.target_kind='user' and u.id is null then 'المستخدم غير موجود أو غير نشط.'
           when t.target_kind='unit' and gu.id is null then 'الوحدة غير موجودة أو غير نشطة.'
           when t.target_kind='unit' and leader.candidate_count=0 then 'لا يوجد مسؤول محدد لهذه الوحدة.'
           when t.target_kind='unit' and leader.candidate_count>1 then 'يوجد أكثر من مسؤول محتمل لهذه الوحدة.' end blocker
    from targets t
    left join qarar_core.governance_units gu on gu.id=t.target_unit_id and gu.organization_id=v_org and gu.status='active'
    left join lateral(
      select count(*)::integer candidate_count,min(c.user_id::text)::uuid user_id from(
        select r.user_id from qarar_core.organizational_unit_responsibles r
        join qarar_iam.users ru on ru.id=r.user_id and ru.organization_id=r.organization_id and ru.status='active'
        where r.organization_id=v_org and r.governance_unit_id=t.target_unit_id
          and r.valid_from<=current_date and (r.valid_until is null or r.valid_until>=current_date)
        union
        select m.user_id from qarar_core.governance_units council
        join qarar_iam.memberships m on m.governance_unit_id=council.id and m.organization_id=council.organization_id
          and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
        join qarar_iam.roles role on role.id=m.role_id and role.organization_id=m.organization_id and role.code='council_chair' and role.is_active
        join qarar_iam.users cu on cu.id=m.user_id and cu.organization_id=m.organization_id and cu.status='active'
        where council.organization_id=v_org and council.scope_unit_id=t.target_unit_id and council.status='active'
          and not exists(select 1 from qarar_core.organizational_unit_responsibles r where r.organization_id=v_org and r.governance_unit_id=t.target_unit_id and r.valid_from<=current_date and (r.valid_until is null or r.valid_until>=current_date))
      ) c
    ) leader on t.target_kind='unit'
    left join qarar_iam.users u on u.id=coalesce(t.target_user_id,leader.user_id) and u.organization_id=v_org and u.status='active'
  )
  select jsonb_build_object(
    'count',count(*) filter(where blocker is null),
    'targets',coalesce(jsonb_agg(jsonb_build_object('target_kind',target_kind,'target_user_id',target_user_id,'target_unit_id',target_unit_id,'resolved_user_id',resolved_user_id,'resolved_user_name_ar',resolved_user_name_ar,'resolved_unit_name_ar',resolved_unit_name_ar,'selection_kind',selection_kind,'source_unit_type_id',source_type,'source_scope_unit_id',source_scope) order by coalesce(resolved_unit_name_ar,resolved_user_name_ar)) filter(where blocker is null),'[]'::jsonb),
    'blockers',coalesce(jsonb_agg(jsonb_build_object('target_unit_id',target_unit_id,'unit_name_ar',resolved_unit_name_ar,'reason',blocker) order by resolved_unit_name_ar) filter(where blocker is not null),'[]'::jsonb)
  ) into v_ctx from resolved;
  return v_ctx;
end;
$$;
alter function qarar_meetings.preview_meeting_assignment_targets(uuid,jsonb) owner to qarar_meetings_executor;
notify pgrst,'reload schema';
commit;
