begin;

alter table qarar_meetings.agenda_items
  add column if not exists topic_status_before_listing text;

comment on column qarar_meetings.agenda_items.topic_status_before_listing is
  'Topic status captured before agenda listing so removal or release can restore the governed state.';

commit;
