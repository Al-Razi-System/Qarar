-- The final summary of results and recommendations is required only for an item whose
-- outcome has no written decision (rejected, tied, postponed, discussed without a vote).
-- An item with an approval decision, or one referred to another unit, carries its
-- outcome in that record, so its summary is optional. The rule now also covers a
-- discussed item that had no vote, which the screen already required
-- (decision of the product owner, 9 November 2026).
-- Impact map: docs/engineering/impact/FINAL_SUMMARY_ONLY_WITHOUT_DECISION_20261109_AR.md
begin;

create or replace function qarar_meetings.require_final_agenda_summaries()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_item record;
begin
  if new.status = 'waiting_for_minutes' and old.status is distinct from new.status then
    select ai.agenda_order, t.title_ar into v_item
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id = ai.topic_id
    left join lateral (
      select vr.closed_at
      from qarar_voting.voting_rounds vr
      where vr.agenda_item_id = ai.id and vr.status = 'closed'
      order by vr.closed_at desc nulls last, vr.opened_at desc
      limit 1
    ) closed_round on true
    where ai.meeting_id = new.id
      and ai.agenda_status in ('discussed','postponed')
      and not exists(select 1 from qarar_decisions.decisions d
        where d.agenda_item_id = ai.id and d.outcome_kind = 'approval')
      and not exists(select 1 from qarar_meetings.agenda_item_referrals r where r.agenda_item_id = ai.id)
      and (
        char_length(btrim(coalesce(ai.discussion_notes, ''))) < 5
        or (closed_round.closed_at is not null and ai.updated_at < closed_round.closed_at)
      )
    order by ai.agenda_order
    limit 1;

    if v_item.agenda_order is not null then
      raise exception 'احفظ ملخص النتائج والتوصيات النهائي للبند % «%» (البند بلا قرار مكتوب يوثق نتيجته).', v_item.agenda_order, v_item.title_ar
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
alter function qarar_meetings.require_final_agenda_summaries() owner to qarar_meetings_executor;

notify pgrst,'reload schema';
commit;
