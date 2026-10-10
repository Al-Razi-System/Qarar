-- Closes the database checks that failed on the working branch (14, 28) with
-- behaviour-preserving changes; see the PR description for each root cause.
begin;

-- 1. Module functions run under their module role (test 14). Both are pure
--    (no table access) and already executable only by their module executor.
alter function qarar_governance.topic_schedule_window_v2(text,jsonb,date) security definer;
alter function qarar_iam.set_membership_change_clock_v2() security definer;

-- 2. Explicit tenant guard on two contract wrappers (test 14). The inner
--    functions already scope to the caller's organization; the wrappers now
--    say so themselves, with the same result.
CREATE OR REPLACE FUNCTION qarar_meetings.get_meeting_detail(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare detail jsonb; suggestions jsonb:='[]'::jsonb;
begin
 -- Explicit tenant guard at the contract boundary (same answer as the inner read).
 if not exists(select 1 from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id()) then
  raise exception using errcode='P0002',message='الاجتماع غير موجود.';
 end if;
 detail:=qarar_meetings.get_meeting_detail_before_suggestions(p_meeting_id);
 if coalesce((detail#>>'{capabilities,can_manage_agenda}')::boolean,false) then
  suggestions:=qarar_governance.scheduled_agenda_suggestions_v2((detail->>'governance_unit_id')::uuid,(detail->>'scheduled_date')::date);
 end if;
 return detail||jsonb_build_object('scheduled_suggestions',suggestions);
end $function$;

CREATE OR REPLACE FUNCTION qarar_governance.admin_get_route_layouts_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare result jsonb; items jsonb;
begin
 result:=qarar_governance.admin_get_route_designer_v2();
 select coalesce(jsonb_agg(t||jsonb_build_object('layout_only',v.layout_only,'payload',case when v.layout_only then v.designer_payload else null end,
 'activation_issues',case when v.layout_only then '[]'::jsonb else t->'activation_issues' end) order by t->>'name_ar'),'[]') into items
 from jsonb_array_elements(result->'items') t join qarar_governance.workflow_templates w on w.id=(t->>'id')::uuid and w.organization_id=qarar_iam.current_organization_id()
 left join qarar_governance.workflow_template_versions v on v.id=(t->>'version_id')::uuid where not w.internal_topic_policy;
 return result||jsonb_build_object('items',items);
end $function$;

-- 3. Product decision: creating a council also creates its periodic governance
--    meeting plan (20261006221000, grants in 20261007001000). Register that
--    boundary instead of leaving it as an unregistered grant (tests 14, 28).
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('core','qarar_meetings','meeting_types','Council creation validates the meeting type of its periodic governance meeting'),
 ('core','qarar_meetings','council_meeting_plans_v2','Council creation writes its periodic governance meeting plan')
on conflict do nothing;

-- 4. Freeze the reviewed api_v1 surface. Five service_role contracts of the
--    temporary-password flow (20261009020000) were added after the last freeze
--    (20261006012000) and were reviewed before this update.
update qarar_architecture.api_release_registry r
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
    contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n'
      order by p.proname,pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
      join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname
       and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
