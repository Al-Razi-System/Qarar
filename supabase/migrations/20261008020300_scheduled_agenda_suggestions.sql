begin;

alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) rename to save_governance_bundle_requirements_v2;
create function qarar_governance.save_governance_bundle_draft_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 if p_bundle#>>'{authoring,submission_mode}'='automatic_agenda' and coalesce(p_bundle#>>'{schedule,rule_type}','none')='none' then
  raise exception using errcode='22023',message='حدد جدولة الموضوع قبل إضافته تلقائيًا إلى المقترحات';
 end if;
 result:=qarar_governance.save_governance_bundle_requirements_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle);
 -- Also protect callers using the older payload without authoring settings.
 if exists(select 1 from qarar_governance.governance_bundles_v2 b
  join qarar_governance.topic_type_authoring_profiles_v2 p on p.topic_type_version_id=b.topic_type_version_id and p.organization_id=b.organization_id
  join qarar_governance.topic_schedule_policies_v2 s on s.topic_type_version_id=b.topic_type_version_id and s.organization_id=b.organization_id
  where b.id=(result->>'bundle_id')::uuid and b.organization_id=qarar_iam.current_organization_id() and p.submission_mode='automatic_agenda' and s.rule_type='none') then
  raise exception using errcode='22023',message='ألغِ الإضافة التلقائية عند إلغاء جدولة الموضوع';
 end if;
 return result;
end $$;

-- Suggestions are derived, not topics or approved agenda items. Re-reading is
-- side-effect free and cannot create a duplicate occurrence.
create function qarar_governance.scheduled_agenda_suggestions_v2(p_council_id uuid,p_on date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 perform qarar_iam.assert_permission('agenda.manage',p_council_id);
 if p_on is null then raise exception using errcode='22023',message='حدد تاريخ الاجتماع لعرض المقترحات المجدولة'; end if;
 if not exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o and status='active') then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'topic_type_version_id',v.id,'title_ar',t.name_ar,'available_from',w.occurrence->>'available_from','due_on',w.occurrence->>'due_on',
  'required_attachment_count',p.required_attachment_count) order by t.name_ar,v.id),'[]'::jsonb) into result
 from qarar_governance.topic_type_versions_v2 v
 join qarar_governance.topic_types_v2 t on t.id=v.topic_type_id and t.organization_id=v.organization_id
 join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=v.id and b.organization_id=v.organization_id and b.status='effective'
 join qarar_governance.topic_type_authoring_profiles_v2 p on p.topic_type_version_id=v.id and p.organization_id=v.organization_id and p.submission_mode='automatic_agenda'
 join qarar_governance.topic_schedule_policies_v2 sp on sp.topic_type_version_id=v.id and sp.organization_id=v.organization_id and sp.status='effective' and sp.rule_type<>'none'
 join qarar_governance.topic_type_workflow_bindings_v2 wb on wb.topic_type_version_id=v.id and wb.organization_id=v.organization_id and wb.status='effective'
 cross join lateral (select qarar_governance.topic_schedule_window_v2(sp.rule_type,sp.rule_config,p_on) occurrence) w
 where v.organization_id=o and v.status='effective'
 and v.effective_from<=p_on and (v.effective_to is null or v.effective_to>=p_on)
 and sp.effective_from<=p_on and (sp.effective_to is null or sp.effective_to>=p_on)
 and wb.valid_from<=p_on and (wb.valid_to is null or wb.valid_to>=p_on)
 and coalesce((w.occurrence->>'is_due')::boolean,false)
 and qarar_governance.topic_type_origin_allowed_v2(v.id,p_council_id)
 and exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=wb.workflow_template_version_id and s.organization_id=o and s.is_initial
  and qarar_governance.resolve_step_unit(o,p_council_id,s.governance_unit_id,s.governance_class_id)=p_council_id);
 return result;
end $$;

alter function qarar_meetings.get_meeting_detail(uuid) rename to get_meeting_detail_before_suggestions;
create function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare detail jsonb; suggestions jsonb:='[]'::jsonb;
begin
 detail:=qarar_meetings.get_meeting_detail_before_suggestions(p_meeting_id);
 if coalesce((detail#>>'{capabilities,can_manage_agenda}')::boolean,false) then
  suggestions:=qarar_governance.scheduled_agenda_suggestions_v2((detail->>'governance_unit_id')::uuid,(detail->>'scheduled_date')::date);
 end if;
 return detail||jsonb_build_object('scheduled_suggestions',suggestions);
end $$;

update qarar_architecture.function_registry r set function_name=p.proname from pg_proc p where p.oid=r.function_oid and p.proname in ('save_governance_bundle_requirements_v2','get_meeting_detail_before_suggestions');
do $$ declare f record; executor text; begin
 for f in select p.oid,p.proname,n.nspname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='qarar_governance' and p.proname in ('save_governance_bundle_draft_v2','scheduled_agenda_suggestions_v2')) or (n.nspname='qarar_meetings' and p.proname='get_meeting_detail') loop
  executor:=case when f.nspname='qarar_governance' then 'qarar_governance_executor' else 'qarar_meetings_executor' end;
  execute format('alter function %I.%I(%s) owner to %I',f.nspname,f.proname,f.args,executor);
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
  execute format('grant execute on function %I.%I(%s) to %I',f.nspname,f.proname,f.args,executor);
  if f.proname<>'scheduled_agenda_suggestions_v2' then execute format('grant execute on function %I.%I(%s) to qarar_api_executor',f.nspname,f.proname,f.args); end if;
  insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
  values(f.oid,f.proname,f.args,case when f.nspname='qarar_governance' then 'governance' else 'meetings' end,f.nspname,false);
 end loop;
end $$;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('meetings','qarar_governance','scheduled_agenda_suggestions_v2','p_council_id uuid, p_on date','Read date and origin scoped suggestions while preparing an agenda') on conflict do nothing;
grant execute on function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) to qarar_meetings_executor;
notify pgrst,'reload schema';
commit;
