begin;
-- Guidance remains optional and uses the existing immutable topic snapshot.
alter table qarar_governance.topic_type_authoring_profiles_v2
 add column submission_instructions text not null default '' check(char_length(submission_instructions)<=10000),
 add column discussion_instructions text not null default '' check(char_length(discussion_instructions)<=10000);
CREATE OR REPLACE FUNCTION qarar_governance.save_governance_bundle_requirements_v2(p_bundle_id uuid, p_expected_lock_version integer, p_client_request_id uuid, p_bundle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); settings jsonb:=p_bundle->'authoring'; fp text; receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype; result jsonb; vid uuid; target uuid; item record; authority uuid; count_required integer; mode text; scope text; rule text; config jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 if settings is null then return qarar_governance.save_governance_bundle_identity_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle); end if;
 if o is null or actor is null or p_client_request_id is null then raise exception using errcode='22023',message='تعذر تحديد سياق حفظ التصنيف'; end if;
 fp:=encode(sha256(convert_to(coalesce(p_bundle_id::text,'new')||':'||coalesce(p_expected_lock_version::text,'new')||':'||p_bundle::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 scope:=settings->>'scope_kind'; mode:=settings->>'submission_mode';
 if jsonb_typeof(settings) is distinct from 'object' or scope is null or scope not in ('route','councils','classes') or mode is null or mode not in ('manual','automatic_agenda')
 or jsonb_typeof(settings->'scope_ids') is distinct from 'array' or jsonb_typeof(settings->'source_item_ids') is distinct from 'array'
 or coalesce(settings->>'required_attachment_count','')!~'^\d{1,2}$'
 or exists(select 1 from jsonb_object_keys(settings) k where k not in ('scope_kind','scope_ids','source_item_ids','required_attachment_count','submission_mode','submission_instructions','discussion_instructions')) then
  raise exception using errcode='22023',message='راجع نطاق التصنيف وأسانيده ومتطلبات المرفقات'; end if;
 if exists(select 1 from jsonb_each(settings) e where e.key in ('submission_instructions','discussion_instructions') and (jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}')>10000)) then
 raise exception using errcode='22023',message='التعليمات يجب أن تكون نصًا لا يتجاوز 10000 حرف لكل قسم'; end if;
 count_required:=(settings->>'required_attachment_count')::integer;
 if count_required>50 or jsonb_array_length(settings->'scope_ids')>100 or jsonb_array_length(settings->'source_item_ids')>100
 or (scope='route' and jsonb_array_length(settings->'scope_ids')<>0) or (scope<>'route' and jsonb_array_length(settings->'scope_ids')=0) then
 raise exception using errcode='22023',message='حدد النطاق المطلوب وعددًا صحيحًا للمرفقات'; end if;
 if (select count(distinct x) from jsonb_array_elements_text(settings->'scope_ids') x)<>jsonb_array_length(settings->'scope_ids') or (select count(distinct x) from jsonb_array_elements_text(settings->'source_item_ids') x)<>jsonb_array_length(settings->'source_item_ids') then raise exception using errcode='22023',message='لا تكرر المجلس أو البند في التصنيف'; end if;
 rule:=p_bundle->'schedule'->>'rule_type'; config:=p_bundle->'schedule'->'rule_config';
 perform qarar_governance.topic_schedule_window_v2(rule,config,current_date);
 result:=qarar_governance.save_governance_bundle_identity_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle-'authoring');
 select topic_type_version_id into vid from qarar_governance.governance_bundles_v2 where id=(result->>'bundle_id')::uuid and organization_id=o;
 insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count,submission_mode,submission_instructions,discussion_instructions)
 values(vid,o,scope,count_required,mode,btrim(coalesce(settings->>'submission_instructions','')),btrim(coalesce(settings->>'discussion_instructions','')))
 on conflict(topic_type_version_id) do update set scope_kind=excluded.scope_kind,required_attachment_count=excluded.required_attachment_count,submission_mode=excluded.submission_mode,
 submission_instructions=case when settings ? 'submission_instructions' then excluded.submission_instructions else qarar_governance.topic_type_authoring_profiles_v2.submission_instructions end,
 discussion_instructions=case when settings ? 'discussion_instructions' then excluded.discussion_instructions else qarar_governance.topic_type_authoring_profiles_v2.discussion_instructions end;
 delete from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id=vid and organization_id=o;
 for target in select value::uuid from jsonb_array_elements_text(settings->'scope_ids') loop
  if scope='councils' and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.id=target and u.organization_id=o and u.status in ('active','inactive') and t.is_council_type) then raise exception using errcode='22023',message='المجلس المحدد غير متاح في مؤسستك'; end if;
  if scope='classes' and not exists(select 1 from qarar_governance.governance_unit_classes c where c.id=target and c.organization_id=o and c.is_active) then raise exception using errcode='22023',message='مستوى المجلس المحدد غير متاح'; end if;
  insert into qarar_governance.topic_type_origin_scopes_v2 values(vid,o,case when scope='councils' then target end,case when scope='classes' then target end);
 end loop;
 -- Source snapshots are taken only from published, active regulation items.
 delete from qarar_governance.topic_type_authorities_v2 a using qarar_governance.legal_authorities_v2 l where a.legal_authority_id=l.id and a.organization_id=o and a.topic_type_version_id=vid and l.organization_id=o and l.source_policy_item_id is not null;
 for target in select value::uuid from jsonb_array_elements_text(settings->'source_item_ids') loop
  select i.*,p.name_ar document_name,v.version_no,v.effective_from,v.effective_to into item from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id and v.organization_id=i.organization_id join qarar_governance.policies p on p.id=v.policy_id and p.organization_id=v.organization_id
  where i.id=target and i.organization_id=o and i.is_active and i.item_type not in ('chapter','section') and p.status='active' and v.legal_status='effective' and v.effective_from<=current_date and (v.effective_to is null or v.effective_to>=current_date) and nullif(btrim(coalesce(i.official_text,i.body_text)),'') is not null;
  if not found then raise exception using errcode='22023',message='اختر بندًا نشطًا من نص لائحة نافذ؛ حدّث الخيارات إذا تغير البند'; end if;
  insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,source_document_version,article_number,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,effective_from,effective_to,reviewed_by_user_id,reviewed_at,created_by_user_id,source_policy_item_id)
  values(o,item.document_name,item.version_no::text,item.item_code,coalesce(item.official_text,item.body_text),'jurisdiction',encode(sha256(convert_to('policy-item:'||target::text||':'||coalesce(item.official_text,item.body_text),'UTF8')),'hex'),'approved',true,item.effective_from,item.effective_to,actor,now(),actor,target)
  on conflict(organization_id,source_fingerprint) do nothing returning id into authority;
  if authority is null then select id into authority from qarar_governance.legal_authorities_v2 where organization_id=o and source_fingerprint=encode(sha256(convert_to('policy-item:'||target::text||':'||coalesce(item.official_text,item.body_text),'UTF8')),'hex'); end if;
  insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id) values(o,vid,authority,'jurisdiction',actor);
  authority:=null;
 end loop;
 result:=result||jsonb_build_object('authoring',qarar_governance.topic_type_authoring_settings_v2(vid),'validation_summary',qarar_governance.validate_governance_bundle_v2_core((result->>'bundle_id')::uuid));
 update qarar_governance.governance_bundle_command_receipts_v2 set request_fingerprint=fp,response_payload=result where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION qarar_governance.manage_topic_type_before_direct_v2(p_bundle_id uuid, p_action text, p_expected_lock_version integer, p_client_request_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); type_id uuid; enabled boolean;
 b qarar_governance.governance_bundles_v2%rowtype; receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
 v qarar_governance.topic_type_versions_v2%rowtype; nb uuid; nv uuid; existing uuid; result jsonb; fp text; old record;
begin
 if p_action not in ('begin_edit','enable','disable','submit','approve','activate','request_changes') or p_action is null
 or p_bundle_id is null or p_expected_lock_version is null or p_client_request_id is null then
  raise exception using errcode='22023',message='حدد التصنيف والإجراء ونسخة البيانات ومفتاح الطلب'; end if;
 perform qarar_iam.assert_permission(case when p_action in ('activate','enable','disable') then 'governance.model.activate'
  when p_action='approve' then 'governance.model.approve' when p_action='request_changes' then 'governance.model.review' else 'governance.model.edit' end,null);
 fp:=encode(sha256(convert_to(jsonb_build_array(p_bundle_id,p_action,p_expected_lock_version,p_comment)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='manage_topic_type_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 select tv.topic_type_id into type_id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id where gb.id=p_bundle_id and gb.organization_id=o;
 if type_id is null then raise exception using errcode='P0002',message='تعذر العثور على التصنيف'; end if;
 -- Lock the stable identity first, serializing edits and replacement publication.
 select is_enabled into enabled from qarar_governance.topic_types_v2 where id=type_id and organization_id=o for update;
 select * into b from qarar_governance.governance_bundles_v2 where id=p_bundle_id and organization_id=o for update;
 if b.lock_version<>p_expected_lock_version then raise exception using errcode='40001',message='تم تعديل التصنيف في جلسة أخرى'; end if;
 select * into v from qarar_governance.topic_type_versions_v2 where id=b.topic_type_version_id and organization_id=o;
 if p_action='begin_edit' then
  if b.status not in ('effective','retired') or not exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 where topic_type_version_id=v.id and organization_id=o) then
   raise exception using errcode='55000',message='التصنيف ليس منشورًا أو يحتاج محررًا متوافقًا مع بياناته السابقة'; end if;
  select gb.id into existing from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id
  where tv.topic_type_id=type_id and tv.organization_id=o and gb.status in ('draft','changes_requested','under_review','approved') order by tv.version_no desc limit 1;
  if existing is not null then raise exception using errcode='40001',message='يوجد تعديل غير منشور لهذا التصنيف؛ افتحه من القائمة'; end if;
  insert into qarar_governance.topic_type_versions_v2(organization_id,topic_type_id,classification_id,version_no,is_governed,acceptance_finality,rejection_finality,created_by_user_id)
  values(o,type_id,v.classification_id,(select max(version_no)+1 from qarar_governance.topic_type_versions_v2 where topic_type_id=type_id and organization_id=o),v.is_governed,v.acceptance_finality,v.rejection_finality,actor) returning id into nv;
  insert into qarar_governance.governance_bundles_v2(organization_id,topic_type_version_id,created_by_user_id) values(o,nv,actor) returning id into nb;
  insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,requirement_level,priority,created_by_user_id)
  select o,nv,legal_authority_id,authority_role,requirement_level,priority,actor from qarar_governance.topic_type_authorities_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,priority,source_layout_version_id,stage_policies,created_by_user_id)
  select o,nv,workflow_template_version_id,priority,source_layout_version_id,stage_policies,actor from qarar_governance.topic_type_workflow_bindings_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,rule_type,rule_config,available_from_offset,target_offset,postpone_until_offset,maximum_postponements,created_by_user_id)
  select o,nv,rule_type,rule_config,available_from_offset,target_offset,postpone_until_offset,maximum_postponements,actor from qarar_governance.topic_schedule_policies_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count,submission_mode,submission_instructions,discussion_instructions)
  select nv,o,scope_kind,required_attachment_count,submission_mode,submission_instructions,discussion_instructions from qarar_governance.topic_type_authoring_profiles_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_origin_scopes_v2(topic_type_version_id,organization_id,council_id,governance_class_id)
  select nv,o,council_id,governance_class_id from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id=v.id and organization_id=o;
  update qarar_governance.governance_bundles_v2 set lock_version=lock_version+1,updated_at=clock_timestamp() where id=b.id;
  result:=jsonb_build_object('bundle_id',nb,'lock_version',1,'status','draft','idempotent_replay',false);
 elsif p_action in ('enable','disable') then
  if not exists(select 1 from qarar_governance.topic_type_versions_v2 where topic_type_id=type_id and organization_id=o and status='effective') then
   raise exception using errcode='55000',message='يلزم تنشيط نسخة معتمدة قبل تغيير إتاحة التصنيف'; end if;
  update qarar_governance.topic_types_v2 set is_enabled=(p_action='enable'),updated_at=clock_timestamp() where id=type_id and organization_id=o;
  for old in select gb.id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id where tv.topic_type_id=type_id and tv.organization_id=o order by gb.id for update of gb loop
   update qarar_governance.governance_bundles_v2 set lock_version=lock_version+1,updated_at=clock_timestamp() where id=old.id;
  end loop;
  select lock_version into b.lock_version from qarar_governance.governance_bundles_v2 where id=b.id;
  result:=jsonb_build_object('bundle_id',b.id,'lock_version',b.lock_version,'is_enabled',p_action='enable','idempotent_replay',false);
 elsif p_action='submit' then result:=qarar_governance.submit_governance_bundle_v2(b.id,b.lock_version,p_client_request_id);
 elsif p_action='approve' then result:=qarar_governance.approve_governance_bundle_v2(b.id,b.lock_version,p_comment,p_client_request_id);
 elsif p_action='request_changes' then result:=qarar_governance.request_governance_bundle_changes_v2(b.id,b.lock_version,p_comment,p_client_request_id);
 else
  if b.status<>'approved' then raise exception using errcode='55000',message='اعتماد التصنيف مطلوب قبل التنشيط'; end if;
  -- Retire availability only. Executable workflow versions/instances are untouched.
  for old in select gb.id,gb.topic_type_version_id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id
   where tv.topic_type_id=type_id and tv.organization_id=o and tv.status='effective' and tv.id<>v.id order by gb.id for update of gb loop
   update qarar_governance.topic_type_versions_v2 set status='retired',updated_at=clock_timestamp() where id=old.topic_type_version_id;
   update qarar_governance.topic_type_workflow_bindings_v2 set status='retired',updated_at=clock_timestamp() where topic_type_version_id=old.topic_type_version_id;
   update qarar_governance.topic_schedule_policies_v2 set status='retired',updated_at=clock_timestamp() where topic_type_version_id=old.topic_type_version_id;
   update qarar_governance.governance_bundles_v2 set status='retired',lock_version=lock_version+1,updated_at=clock_timestamp() where id=old.id;
   insert into qarar_governance.governance_bundle_reviews_v2(organization_id,bundle_id,action,bundle_lock_version,actor_user_id)
   select o,id,'retired',lock_version,actor from qarar_governance.governance_bundles_v2 where id=old.id;
  end loop;
  result:=qarar_governance.activate_governance_bundle_v2(b.id,b.lock_version,current_date,p_client_request_id);
  -- Activation does not silently override an explicit disabled identity.
 end if;
 insert into qarar_governance.governance_bundle_command_receipts_v2(organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload)
 values(o,b.id,actor,'manage_topic_type_v2',p_client_request_id,fp,result);
 perform qarar_audit.append_audit_log(o,'governance.topic_type.'||p_action,'topic_types_v2',type_id,jsonb_build_object('bundle_id',b.id,'client_request_id',p_client_request_id,'result',result));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION qarar_meetings.get_meeting_detail_before_suggestions(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_can_manage boolean;
  v_can_agenda boolean;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if v_m.created_by_user_id <> auth.uid()
     and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('meetings.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'لا تملك صلاحية عرض هذا الاجتماع.';
  end if;

  v_can_manage := qarar_iam.is_system_admin()
    or qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id);
  v_can_agenda := qarar_iam.is_system_admin()
    or qarar_iam.has_permission('agenda.manage', v_m.governance_unit_id);

  return (
    select to_jsonb(m) || jsonb_build_object(
      'unit_name_ar', gu.name_ar,
      'governance_unit_name_ar', gu.name_ar,
      'meeting_type_name_ar', mt.name_ar,
      'agenda_count', (select count(*) from qarar_meetings.agenda_items where meeting_id = m.id),
      'governance_unit', jsonb_build_object('id', gu.id, 'code', gu.code, 'name_ar', gu.name_ar),
      'meeting_type', jsonb_build_object('id', mt.id, 'code', mt.code, 'name_ar', mt.name_ar),
      'capabilities', jsonb_build_object(
        'can_manage', v_can_manage,
        'can_manage_agenda', v_can_agenda and m.status in ('draft', 'scheduled'),
        'can_schedule', v_can_manage and m.status = 'draft',
        'can_send_invitations', v_can_manage and m.status = 'scheduled',
        'can_prepare_session', v_can_manage and m.status = 'scheduled',
        'can_start_session', v_can_manage and m.status = 'ready_to_start',
        'can_cancel', v_can_manage and m.status in ('draft', 'scheduled', 'ready_to_start'),
        'can_archive', v_can_manage and m.status = 'closed'
      ),
      'agenda_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ai.id,
          'agenda_order', ai.agenda_order,
          'agenda_status', ai.agenda_status,
          'discussion_notes', ai.discussion_notes,
          'discussion_instructions', t.typed_creation_request#>>'{snapshot,authoring,discussion_instructions}',
          'is_exception', ai.is_exception,
          'exception_reason', ai.exception_reason,
          'voting_status', ai.voting_status,
          'voting_result', ai.voting_result,
          'updated_at', ai.updated_at,
          'workflow_step_type', governance_context ->> 'workflow_step_type',
          'workflow_responsibility', governance_context ->> 'workflow_responsibility',
          'workflow_step_name_ar', governance_context ->> 'workflow_step_name_ar',
          'voting_available_now', coalesce((governance_context ->> 'voting_available_now')::boolean, false),
          'requires_voting', coalesce((governance_context ->> 'requires_voting')::boolean, false),
          'topic', jsonb_build_object(
            'id', t.id,
            'topic_no', t.topic_no,
            'title_ar', t.title_ar,
            'status', t.status,
            'priority', t.priority,
            'category_name_ar', tc.name_ar,
            'submitted_by_name_ar', submitter.full_name_ar
          )
        ) order by ai.agenda_order)
        from qarar_meetings.agenda_items ai
        join qarar_topics.topics t on t.id = ai.topic_id
        left join qarar_topics.topic_categories tc on tc.id = t.category_id
        join qarar_iam.users submitter on submitter.id = t.submitted_by_user_id
        left join lateral qarar_governance.get_topic_agenda_context(t.id)
          gc(governance_context) on true
        where ai.meeting_id = m.id
      ), '[]'::jsonb),
      'status_history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id,
          'from_status', h.from_status,
          'to_status', h.to_status,
          'reason', h.change_reason,
          'changed_at', h.changed_at
        ) order by h.changed_at, h.id)
        from qarar_meetings.meeting_status_history h
        where h.meeting_id = m.id
      ), '[]'::jsonb)
    )
    from qarar_meetings.meetings m
    join qarar_core.governance_units gu on gu.id = m.governance_unit_id
    left join qarar_meetings.meeting_types mt on mt.id = m.meeting_type_id
    where m.id = v_m.id
  );
end;
$function$;

notify pgrst,'reload schema';
commit;

