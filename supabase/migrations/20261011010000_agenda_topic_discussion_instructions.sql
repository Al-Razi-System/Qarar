begin;
grant execute on function qarar_iam.has_unit_role_code(uuid,text[]) to qarar_meetings_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values ('meetings','qarar_iam','has_unit_role_code','target_unit_id uuid, role_codes text[]','Only the active chair of the same council customizes the agenda topic instructions') on conflict do nothing;
-- Per-meeting topic customization, never a write to the topic type or snapshot.
alter table qarar_meetings.agenda_items add column discussion_instructions_override text
 check (char_length(discussion_instructions_override)<=10000);

create function qarar_meetings.save_agenda_topic_instructions(p_meeting_id uuid,p_topic_id uuid,p_instructions text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare m qarar_meetings.meetings%rowtype; a qarar_meetings.agenda_items%rowtype; previous text;
begin
 select * into m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
 if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
 if not qarar_iam.has_unit_role_code(m.governance_unit_id,array['council_chair']) then raise exception using errcode='42501',message='تخصيص تعليمات الموضوع متاح لرئيس هذا المجلس فقط.';end if;
 perform qarar_iam.assert_permission('agenda.manage',m.governance_unit_id);
 if m.status not in ('draft','scheduled') then raise exception using errcode='55000',message='تعليمات المناقشة مقفلة بعد انتهاء تحضير الاجتماع.';end if;
 if p_instructions is null or char_length(p_instructions)>10000 then raise exception using errcode='22023',message='تعليمات المناقشة يجب ألا تتجاوز الحد المتاح.';end if;
 select * into a from qarar_meetings.agenda_items where meeting_id=m.id and topic_id=p_topic_id and organization_id=m.organization_id for update;
 if a.id is null then
  if p_expected_updated_at is not null then raise exception using errcode='40001',message='تغير جدول الأعمال. حدّث المقترحات ثم أعد المحاولة.';end if;
  perform qarar_meetings.add_agenda_item(m.id,p_topic_id,false,null);
  select * into a from qarar_meetings.agenda_items where meeting_id=m.id and topic_id=p_topic_id and organization_id=m.organization_id for update;
 else
  if p_expected_updated_at is null or a.updated_at<>p_expected_updated_at then raise exception using errcode='40001',message='تغير الموضوع المدرج. حدّث الاجتماع قبل إعادة الحفظ.';end if;
 end if;
 previous:=a.discussion_instructions_override;
 update qarar_meetings.agenda_items set discussion_instructions_override=p_instructions where id=a.id and organization_id=m.organization_id returning * into a;
 perform qarar_audit.append_audit_log(m.organization_id,'agenda.instructions.update','agenda_item',a.id,jsonb_build_object('meeting_id',m.id,'topic_id',p_topic_id,'previous',previous,'current',p_instructions));
 return jsonb_build_object('id',a.id,'updated_at',a.updated_at);
end $$;
create function api_v1.save_agenda_topic_instructions(p_meeting_id uuid,p_topic_id uuid,p_instructions text,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_meetings.save_agenda_topic_instructions($1,$2,$3,$4)$$;
alter function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) to qarar_api_executor;
alter function api_v1.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) owner to qarar_api_executor;
revoke all on function api_v1.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function api_v1.save_agenda_topic_instructions(uuid,uuid,text,timestamptz) to authenticated,service_role;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p where p.oid='qarar_meetings.save_agenda_topic_instructions(uuid,uuid,text,timestamptz)'::regprocedure;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v1',p.proname,'qarar_meetings',p.proname,pg_get_function_identity_arguments(p.oid),'meetings','authenticated' from pg_proc p where p.oid='api_v1.save_agenda_topic_instructions(uuid,uuid,text,timestamptz)'::regprocedure;

-- Preserve the existing permission, eligibility, planned-date and suggestion gates.
do $$declare definition text; marker text;begin
 definition:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
 marker:='return detail||jsonb_build_object';
 if position(marker in definition)=0 then raise exception 'Meeting detail contract drift';end if;
 definition:=replace(definition,marker,'detail:=jsonb_set(detail,''{capabilities,can_edit_topic_instructions}'',to_jsonb(qarar_iam.has_unit_role_code((detail->>''governance_unit_id'')::uuid,array[''council_chair'']) and coalesce((detail#>>''{capabilities,can_manage_agenda}'')::boolean,false)));
 detail:=jsonb_set(detail,''{agenda_items}'',coalesce((select jsonb_agg(i||jsonb_build_object(''discussion_instructions'',coalesce(a.discussion_instructions_override,i->>''discussion_instructions'')) order by (i->>''agenda_order'')::integer) from jsonb_array_elements(detail->''agenda_items'') i join qarar_meetings.agenda_items a on a.id=(i->>''id'')::uuid and a.organization_id=qarar_iam.current_organization_id()),''[]''::jsonb));
 return detail||jsonb_build_object');
 execute definition;
 definition:=pg_get_functiondef('qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)'::regprocedure);
 marker:='t.title_ar,';
 if position(marker in definition)=0 then raise exception 'Agenda search contract drift';end if;
 definition:=replace(definition,marker,'t.title_ar,t.typed_creation_request#>>''{snapshot,authoring,discussion_instructions}'' as discussion_instructions,');
 marker:='''title_ar'', p.title_ar,';
 if position(marker in definition)=0 then raise exception 'Agenda candidate contract drift';end if;
 definition:=replace(definition,marker,'''title_ar'', p.title_ar,''discussion_instructions'',p.discussion_instructions,');
 execute definition;
end $$;
update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';
notify pgrst,'reload schema';
commit;
