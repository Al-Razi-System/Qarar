begin;
select plan(4);
select has_function('qarar_meetings','meeting_invitation_snapshot',array['uuid'],'official invitation snapshot builder exists');
select like(pg_get_functiondef('qarar_meetings.send_meeting_invitations(uuid,timestamp with time zone)'::regprocedure),'%meeting_invitation_snapshot%','initial invitations persist the official snapshot');
select like(pg_get_functiondef('qarar_meetings.enqueue_invitee_change_notifications(uuid,uuid,text,text)'::regprocedure),'%meeting_invitation_snapshot%','updated invitations persist a new official snapshot');
select ok(not has_function_privilege('authenticated','qarar_meetings.meeting_invitation_snapshot(uuid)','EXECUTE'),'clients cannot read service invitation snapshots directly');
select * from finish();
rollback;
