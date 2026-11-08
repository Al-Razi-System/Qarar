-- The final-summary guard also asks for notes on a discussed item that has no vote, but
-- an item of a governed topic that was never voted is the vote guard's business (it
-- names the missing vote). The summary rule applies to items with a closed vote, to
-- postponed items, and to direct topics discussed without a vote.
-- Impact map: docs/engineering/impact/FINAL_SUMMARY_ONLY_WITHOUT_DECISION_20261109_AR.md
begin;

do $$
declare v_def text;v_old text:='      and ai.agenda_status in (''discussed'',''postponed'')
';
begin
  v_def:=pg_get_functiondef('qarar_meetings.require_final_agenda_summaries()'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'require_final_agenda_summaries status filter not found exactly once';
  end if;
  execute replace(v_def,v_old,v_old||'      and (closed_round.closed_at is not null or ai.agenda_status = ''postponed'' or t.meeting_scope_id is not null)
');
end;
$$;

notify pgrst,'reload schema';
commit;
