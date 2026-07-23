-- RPCs require an authenticated application or trusted service context.

revoke execute on function public.recalculate_meeting_quorum(uuid,boolean),
 public.open_meeting_session(uuid,timestamptz),
 public.record_attendance(uuid,text,text,timestamptz),
 public.get_meeting_session_detail(uuid),
 public.get_attendance_history(uuid),
 public.apply_quorum_failure(uuid,text,text,timestamptz),
 public.open_voting_round(uuid,timestamptz),
 public.cast_vote(uuid,text,text),
 public.close_voting_round(uuid,text),
 public.cancel_voting_round(uuid,text),
 public.get_my_open_votes(uuid),
 public.get_voting_round_detail(uuid)
from public,anon;

grant execute on function public.recalculate_meeting_quorum(uuid,boolean),
 public.open_meeting_session(uuid,timestamptz),
 public.record_attendance(uuid,text,text,timestamptz),
 public.get_meeting_session_detail(uuid),
 public.get_attendance_history(uuid),
 public.apply_quorum_failure(uuid,text,text,timestamptz),
 public.open_voting_round(uuid,timestamptz),
 public.cast_vote(uuid,text,text),
 public.close_voting_round(uuid,text),
 public.cancel_voting_round(uuid,text),
 public.get_my_open_votes(uuid),
 public.get_voting_round_detail(uuid)
to authenticated,service_role;
