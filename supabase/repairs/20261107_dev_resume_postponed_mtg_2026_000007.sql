-- Development database only (devqarar). One meeting, one time; safe to repeat.
--
-- MTG-2026-000007 (council: كلية العلوم الإدارية والإنسانية) was postponed on
-- 2026-11-07 17:18 UTC by its chair through the quorum dialog, with the reason
-- "المواضيع مهمة ولا يمكن تأجيلها" — a mis-click: the chair meant to continue
-- without the quorum. A postponement was final, so this returns the meeting to the
-- step before it (in progress, quorum decision pending) through the same
-- transition the resume contract uses, with a status-history row and an audit event.
-- The next cycle of its plan starts on 2026-11-08, so this must run on 2026-11-07
-- (organisation time); the transition guard refuses it afterwards.
-- Take a backup first. Never run it on production.
begin;

do $repair$
declare
  v_meeting constant uuid:='201fc31a-e62b-41bd-9636-1447b63af4e2';
  v_chair constant uuid:='d6a4bdbf-17c9-4a11-89a7-97511649df45';
  m qarar_meetings.meetings%rowtype;
  v_reason constant text:='إعادة الاجتماع إلى خطوة ما قبل التأجيل: التأجيل كان خطأ في نافذة النصاب، والرئيس يريد المتابعة.';
begin
  select * into m from qarar_meetings.meetings where id=v_meeting;
  if m.id is null or m.status<>'postponed' then return; end if;
  if not exists(select 1 from qarar_meetings.meeting_status_history h
      where h.meeting_id=v_meeting and h.from_status='in_progress' and h.to_status='postponed'
        and h.changed_by_user_id=v_chair and h.change_reason='المواضيع مهمة ولا يمكن تأجيلها') then
    raise exception 'The postponement of % is not the one this repair was written for',v_meeting;
  end if;
  perform set_config('request.jwt.claims',json_build_object('sub',v_chair,'role','authenticated')::text,true);
  perform set_config('qarar.resuming_postponed_meeting','on',true);
  update qarar_meetings.meetings set status='in_progress' where id=v_meeting;
  perform set_config('qarar.resuming_postponed_meeting','',true);
  insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(m.organization_id,v_meeting,'postponed','in_progress',v_chair,v_reason);
  perform qarar_audit.append_audit_log(m.organization_id,'meeting.postponed.resumed','meetings',v_meeting,
    jsonb_build_object('from_status','postponed','to_status','in_progress','reason',v_reason,'repair','20261107_dev_resume_postponed_mtg_2026_000007'));
end
$repair$;

commit;
