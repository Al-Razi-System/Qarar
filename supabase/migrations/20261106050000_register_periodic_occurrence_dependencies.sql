-- Register the periodic topic occurrence table and the meetings module's reviewed
-- dependencies on it, which 20261105010000 and 20261106020000 introduced without
-- registration (the architecture tests 13 and 14 were red on the base branch).
-- Impact map: docs/engineering/impact/MEETING_CYCLE_GATES_20261106_AR.md
begin;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('topic_schedule_occurrences_v2','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

-- The meetings module reads the organisation's time zone (20261104010000), as
-- attendance already does; the read is registered and granted on the table.
grant select on qarar_core.organizations to qarar_meetings_executor;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
select v.source_module,v.target_schema,v.table_name,v.rationale from (values
  ('meetings','qarar_governance','topic_schedule_occurrences_v2','A meeting lists and lists-in the periodic topic obligations due for its council'),
  ('meetings','qarar_topics','typed_submission_preparations_v2','A scheduled proposal is completed from its own typed submission preparation'),
  ('meetings','qarar_core','organizations','A cycle opens on the organisation''s own calendar day, in its time zone')
) v(source_module,target_schema,table_name,rationale)
where not exists(select 1 from qarar_architecture.module_table_read_allowlist a
  where a.source_module=v.source_module and a.target_schema=v.target_schema and a.table_name=v.table_name);

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values
  ('meetings','qarar_topics','submit_typed_submission_v2','p_request_id uuid','A scheduled proposal submits its prepared topic before listing it'),
  ('meetings','qarar_governance','topic_schedule_windows_v2','p_rule text, p_config jsonb, p_from date, p_to date','A meeting reads the window of a periodic topic obligation')
on conflict do nothing;

-- The window for a day is the one holding it, else the next one; never one that
-- already ended. A bounded schedule therefore has no window after its period
-- (route designer test 45 was red on the base branch).
create or replace function qarar_governance.topic_schedule_window_v2(p_rule text,p_config jsonb,p_on date)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  if p_on is null then raise exception using errcode='22023',message='إعداد توقيت الموضوع غير صالح'; end if;
  select jsonb_build_object('available_from',w.available_from,'due_on',w.due_on,'is_due',p_on between w.available_from and w.due_on)
    into result from qarar_governance.topic_schedule_windows_v2(p_rule,p_config,date_trunc('year',p_on)::date,(date_trunc('year',p_on)+interval '1 year - 1 day')::date) w
    where w.due_on>=p_on
    order by w.available_from limit 1;
  return result;
end $$;
alter function qarar_governance.topic_schedule_window_v2(text,jsonb,date) owner to qarar_governance_executor;

commit;
