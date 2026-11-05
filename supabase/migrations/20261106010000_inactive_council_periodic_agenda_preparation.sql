begin;

-- A newly created council is deliberately inactive while its first agenda is
-- prepared. Existing draft meetings must still receive periodic obligations;
-- council activation and opening the live session remain separate gates.
create or replace function qarar_governance.materialize_topic_schedule_policy_v2(p_policy_id uuid,p_through date)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare inserted_count int;
begin
  if p_policy_id is null or p_through is null then raise exception using errcode='22023',message='تعذر تحديد سياسة الاستحقاق'; end if;
  with candidates as (
    select sp.organization_id,sp.id policy_id,sp.topic_type_version_id,u.id unit_id,w.*
    from qarar_governance.topic_schedule_policies_v2 sp
    join qarar_governance.topic_type_versions_v2 tv on tv.id=sp.topic_type_version_id and tv.organization_id=sp.organization_id and tv.status='effective'
    join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=tv.id and b.organization_id=tv.organization_id and b.status='effective'
    join qarar_governance.topic_type_authoring_profiles_v2 ap on ap.topic_type_version_id=tv.id and ap.organization_id=tv.organization_id and ap.submission_mode='automatic_agenda'
    join qarar_governance.topic_type_workflow_bindings_v2 wb on wb.topic_type_version_id=tv.id and wb.organization_id=tv.organization_id and wb.status='effective'
    join qarar_core.governance_units u on u.organization_id=sp.organization_id and u.status in ('active','inactive')
    join qarar_core.governance_unit_types ut on ut.id=u.unit_type_id and ut.organization_id=u.organization_id and ut.is_council_type
    cross join lateral qarar_governance.topic_schedule_windows_v2(sp.rule_type,sp.rule_config,
      greatest(coalesce(sp.effective_from,tv.effective_from,current_date),coalesce((sp.rule_config->>'starts_on')::date,coalesce(sp.effective_from,tv.effective_from,current_date))),p_through) w
    where sp.id=p_policy_id and sp.status='effective' and sp.rule_type<>'none'
      and (sp.effective_to is null or sp.effective_to>=current_date)
      and (tv.effective_to is null or tv.effective_to>=current_date)
      and ((ap.scope_kind='route')
        or (ap.scope_kind='councils' and exists(select 1 from qarar_governance.topic_type_origin_scopes_v2 s where s.topic_type_version_id=tv.id and s.organization_id=tv.organization_id and s.council_id=u.id))
        or (ap.scope_kind='classes' and exists(select 1 from qarar_governance.topic_type_origin_scopes_v2 s where s.topic_type_version_id=tv.id and s.organization_id=tv.organization_id and s.governance_class_id=u.governance_class_id)))
      and exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=wb.workflow_template_version_id and s.organization_id=sp.organization_id and s.is_initial
        and ((s.governance_unit_id is not null and s.governance_unit_id=u.id)
          or (s.governance_unit_id is null and s.governance_class_id=u.governance_class_id)))
  ), inserted as (
    insert into qarar_governance.topic_schedule_occurrences_v2(organization_id,schedule_policy_id,topic_type_version_id,governance_unit_id,period_key,available_from,due_on)
    select organization_id,policy_id,topic_type_version_id,unit_id,period_key,available_from,due_on from candidates
    on conflict(organization_id,schedule_policy_id,governance_unit_id,period_key) do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end $$;
alter function qarar_governance.materialize_topic_schedule_policy_v2(uuid,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.materialize_topic_schedule_policy_v2(uuid,date) from public,anon,authenticated,service_role;

create or replace function qarar_governance.scheduled_agenda_suggestions_v2(p_council_id uuid,p_on date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
  perform qarar_iam.assert_permission('agenda.manage',p_council_id);
  if p_on is null then raise exception using errcode='22023',message='حدد تاريخ الاجتماع لعرض المقترحات المجدولة'; end if;
  if not exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o and status in ('active','inactive')) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurrence_id',occ.id,'reference_number',occ.reference_number,'period_key',occ.period_key,
    'topic_type_version_id',occ.topic_type_version_id,'title_ar',tt.name_ar,'available_from',occ.available_from,'due_on',occ.due_on,
    'timing_status',case when p_on>occ.due_on then 'overdue' else 'due' end,
    'required_attachment_count',ap.required_attachment_count) order by occ.available_from,tt.name_ar,occ.id),'[]'::jsonb) into result
  from qarar_governance.topic_schedule_occurrences_v2 occ
  join qarar_governance.topic_type_versions_v2 tv on tv.id=occ.topic_type_version_id and tv.organization_id=occ.organization_id and tv.status='effective'
  join qarar_governance.topic_types_v2 tt on tt.id=tv.topic_type_id and tt.organization_id=tv.organization_id and tt.is_enabled
  join qarar_governance.topic_type_authoring_profiles_v2 ap on ap.topic_type_version_id=tv.id and ap.organization_id=tv.organization_id and ap.submission_mode='automatic_agenda'
  where occ.organization_id=o and occ.governance_unit_id=p_council_id and occ.status='due' and occ.available_from<=p_on;
  return result;
end $$;
alter function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) to qarar_meetings_executor;

-- Backfill all unresolved periods for councils already preparing meetings.
select qarar_governance.sync_topic_schedule_occurrences_v2(current_date+366);

select pg_notify('pgrst','reload schema');
commit;
