-- The follow-up of an assignment is optional; without one the council's chair
-- follows it (decision of the product owner, 8 November 2026). The default is
-- resolved on the server, so every client gets the same rule and the stored batch
-- always names a person.
-- Impact map: docs/engineering/impact/ASSIGNMENT_FOLLOW_UP_AND_TARGET_LIST_20261108_AR.md
begin;

do $$
declare v_def text;
  v_old text:='  select * into v_item from qarar_meetings.agenda_items
  where id=p_agenda_item_id and organization_id=v_org for update;
  if v_item.id is null then raise exception using errcode=''P0002'',message=''البند غير موجود.'';end if;
';
begin
  v_def:=pg_get_functiondef('qarar_meetings.propose_meeting_assignment_batch(uuid,text,text,jsonb,date,uuid,boolean,uuid)'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'propose_meeting_assignment_batch item lookup not found exactly once';
  end if;
  execute replace(v_def,v_old,v_old||'  if p_follow_up_user_id is null then
    select m.user_id into p_follow_up_user_id
    from qarar_meetings.meetings mt
    join qarar_iam.memberships m on m.governance_unit_id=mt.governance_unit_id and m.organization_id=mt.organization_id
      and m.membership_status=''active'' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
    join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.code=''council_chair''
    where mt.id=v_item.meeting_id and mt.organization_id=v_org
    order by m.start_date desc limit 1;
    if p_follow_up_user_id is null then
      raise exception using errcode=''22023'',message=''لا يوجد رئيس مجلس نشط ليتابع التكليف؛ اختر متابعاً.'';
    end if;
  end if;
');
end;
$$;

notify pgrst,'reload schema';
commit;
