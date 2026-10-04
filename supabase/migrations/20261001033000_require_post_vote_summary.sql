-- Preliminary discussion notes are not a final result. Validate summary
-- freshness at the meeting state boundary, independently of the client.
create or replace function qarar_meetings.require_final_agenda_summaries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item record;
begin
  if new.status = 'waiting_for_minutes' and old.status is distinct from new.status then
    select ai.agenda_order, t.title_ar into v_item
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id = ai.topic_id
    join lateral (
      select vr.closed_at
      from qarar_voting.voting_rounds vr
      where vr.agenda_item_id = ai.id and vr.status = 'closed'
      order by vr.closed_at desc nulls last, vr.opened_at desc
      limit 1
    ) closed_round on true
    where ai.meeting_id = new.id
      and (
        char_length(btrim(coalesce(ai.discussion_notes, ''))) < 5
        or ai.updated_at < closed_round.closed_at
      )
    order by ai.agenda_order
    limit 1;

    if v_item.agenda_order is not null then
      raise exception 'احفظ ملخص النتائج والتوصيات النهائي للبند % «%» بعد إغلاق التصويت.', v_item.agenda_order, v_item.title_ar
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

alter function qarar_meetings.require_final_agenda_summaries()
  owner to qarar_meetings_executor;

drop trigger if exists meetings_require_final_agenda_summaries on qarar_meetings.meetings;
create trigger meetings_require_final_agenda_summaries
before update of status on qarar_meetings.meetings
for each row execute function qarar_meetings.require_final_agenda_summaries();

-- A formal approved decision and a postponed state are contradictory. Repair
-- existing records while preserving their original note for audit/history.
update qarar_meetings.agenda_items ai
set agenda_status = 'discussed', updated_at = clock_timestamp()
where ai.agenda_status = 'postponed'
  and exists (
    select 1 from qarar_decisions.decisions d
    where d.agenda_item_id = ai.id
  )
  and exists (
    select 1 from qarar_voting.voting_rounds vr
    where vr.agenda_item_id = ai.id
      and vr.status = 'closed'
      and vr.result = 'approved'
  );

select pg_notify('pgrst', 'reload schema');
