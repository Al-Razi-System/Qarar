begin;
create function qarar_governance.attach_typed_prior_route_v2(p_topic_id uuid,p_evidence jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); t qarar_topics.topics%rowtype; request uuid; proof uuid; item jsonb; step record; position integer:=0; total integer; file uuid;
begin
 select * into t from qarar_topics.topics where id=p_topic_id and organization_id=o for update;
 if t.id is null or t.topic_type_version_id is null or t.submitted_by_user_id<>auth.uid() then raise exception using errcode='42501',message='الطلب غير متاح'; end if;
 perform qarar_iam.assert_permission('governance.prior_route.request',(t.typed_creation_request#>>'{input,current_unit_id}')::uuid);
 select count(*) into total from qarar_governance.workflow_instance_steps where workflow_instance_id=t.workflow_instance_id and organization_id=o;
 if jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)<1 or jsonb_array_length(p_evidence)>=total then raise exception using errcode='23514',message='اختر مراحل سابقة متصلة واترك مرحلة متبقية للمناقشة'; end if;
 insert into qarar_governance.topic_prior_route_requests(organization_id,topic_id,workflow_instance_id,status,requested_by_user_id,submitted_at)
 values(o,t.id,t.workflow_instance_id,'submitted',auth.uid(),now()) returning id into request;
 for item in select value from jsonb_array_elements(p_evidence) loop
  position:=position+1;
  select * into step from qarar_governance.workflow_instance_steps where workflow_instance_id=t.workflow_instance_id and organization_id=o order by sequence_no offset position-1 limit 1;
  if step.template_step_id is distinct from (item->>'template_step_id')::uuid
  or coalesce(item->>'meeting_date','')!~'^\d{4}-\d{2}-\d{2}$' or (item->>'meeting_date')::date>current_date
  or coalesce(item->>'decision_type','') not in ('approved','recommended','referred','completed')
  or char_length(btrim(coalesce(item->>'decision_text',''))) not between 3 and 4000
  or char_length(btrim(coalesce(item->>'bypass_reason',''))) not between 10 and 2000
  or jsonb_array_length(coalesce(item->'attachments','[]'::jsonb))=0 then raise exception using errcode='23514',message='أكمل التاريخ والقرار والسبب والمحضر لكل مرحلة سابقة بالترتيب'; end if;
  insert into qarar_governance.topic_prior_route_step_evidence(organization_id,request_id,workflow_instance_step_id,template_step_id,sequence_no,meeting_date,meeting_reference,decision_type,decision_text,bypass_reason)
  values(o,request,step.id,step.template_step_id,step.sequence_no,(item->>'meeting_date')::date,nullif(item->>'meeting_reference',''),item->>'decision_type',btrim(item->>'decision_text'),btrim(item->>'bypass_reason')) returning id into proof;
  for file in select value::uuid from jsonb_array_elements_text(item->'attachments') loop
   if not exists(select 1 from qarar_topics.topic_attachments where id=file and topic_id=t.id and organization_id=o) then raise exception using errcode='23514',message='محضر المرحلة غير مرتبط بهذا الطلب'; end if;
   insert into qarar_governance.topic_prior_route_evidence_attachments(organization_id,step_evidence_id,topic_attachment_id) values(o,proof,file);
  end loop;
 end loop;
 update qarar_governance.workflow_instance_steps set status='pending',opened_at=null where workflow_instance_id=t.workflow_instance_id and organization_id=o;
 update qarar_governance.workflow_instances set status='blocked',current_step_id=null,updated_at=now() where id=t.workflow_instance_id and organization_id=o;
 update qarar_governance.topic_governance_mappings set routing_status='routing_exception_pending',snapshot=snapshot||jsonb_build_object('prior_route_status','submitted') where topic_id=t.id and organization_id=o;
 update qarar_topics.topics set routing_status='routing_exception_pending',current_workflow_step_id=null where id=t.id and organization_id=o;
 perform qarar_audit.append_audit_log(o,'governance.prior_route.submit','topic_prior_route_requests',request,jsonb_build_object('topic_id',t.id,'source','typed_submission'));
 return jsonb_build_object('request_id',request,'prior_route_status','submitted','routing_status','routing_exception_pending','current_workflow_step_id',null);
end $$;
alter function qarar_governance.attach_typed_prior_route_v2(uuid,jsonb) owner to qarar_governance_executor;
revoke all on function qarar_governance.attach_typed_prior_route_v2(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.attach_typed_prior_route_v2(uuid,jsonb) to qarar_topics_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select 'qarar_governance.attach_typed_prior_route_v2(uuid,jsonb)'::regprocedure,'attach_typed_prior_route_v2','p_topic_id uuid, p_evidence jsonb','governance','qarar_governance',false;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values('topics','qarar_governance','attach_typed_prior_route_v2','p_topic_id uuid, p_evidence jsonb','Atomically submit immutable typed route evidence for independent review');
do $$ declare definition text;
begin
 definition:=pg_get_functiondef('qarar_topics.submit_typed_submission_v2(uuid)'::regprocedure);
 definition:=replace(definition,'topic uuid;','topic uuid; evidence jsonb;');
 definition:=replace(definition,'if jsonb_array_length(coalesce(row.input->''evidence'',''[]''::jsonb))>0 then raise exception using errcode=''23514'',message=''استكمال المسار يتطلب مراجعة أدلته قبل تشغيله''; end if;',
 'if jsonb_array_length(coalesce(row.input->''evidence'',''[]''::jsonb))>0 then
 select jsonb_agg(item.value||jsonb_build_object(''attachments'',coalesce((select jsonb_agg(f.id) from qarar_topics.typed_submission_files_v2 f where f.preparation_id=row.id and f.organization_id=o and f.evidence_index=item.position-1),''[]''::jsonb)) order by item.position) into evidence from jsonb_array_elements(row.input->''evidence'') with ordinality item(value,position);
 result:=result||qarar_governance.attach_typed_prior_route_v2(topic,evidence); end if;');
 definition:=replace(definition,'set result=result where id=row.id','set result=submit_typed_submission_v2.result where id=row.id');
 execute definition;
 definition:=pg_get_functiondef('qarar_governance.prepare_typed_topic_v2(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'''workflow_template_version_id'',wf);','''workflow_template_version_id'',wf,''can_resume'',qarar_iam.has_permission(''governance.prior_route.request'',p_unit_id),''prior_steps'',(select jsonb_agg(jsonb_build_object(''template_step_id'',s.id,''name_ar'',s.name_ar) order by s.sequence_no) from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=wf and s.organization_id=o));');
 execute definition;
 -- Correct the review destination for typed resumptions only; historical routes
 -- retain their existing contract and the independent reviewer requirement.
 definition:=pg_get_functiondef('qarar_governance.review_topic_prior_route_request(uuid,text,text)'::regprocedure);
 definition:=replace(definition,'current_workflow_step_id=v_next,updated_at=clock_timestamp()', 'current_workflow_step_id=v_next,current_unit_id=case when topic_type_version_id is not null then (select assigned_unit_id from qarar_governance.workflow_instance_steps where id=v_next) else current_unit_id end,updated_at=clock_timestamp()');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
