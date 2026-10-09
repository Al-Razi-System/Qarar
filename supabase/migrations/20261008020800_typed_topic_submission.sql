begin;
alter table qarar_topics.topics add column topic_type_version_id uuid,add column typed_creation_request jsonb;
alter table qarar_topics.topics add constraint topics_type_version_fk foreign key(topic_type_version_id,organization_id) references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict;
alter table qarar_topics.topics add constraint topics_typed_request_check check((topic_type_version_id is null and typed_creation_request is null) or (topic_type_version_id is not null and typed_creation_request is not null and jsonb_typeof(typed_creation_request)='object'));
create table qarar_topics.topic_type_category_links(
 topic_type_id uuid primary key,organization_id uuid not null,category_id uuid not null,
 foreign key(topic_type_id,organization_id) references qarar_governance.topic_types_v2(id,organization_id) on delete restrict,
 foreign key(category_id,organization_id) references qarar_topics.topic_categories(id,organization_id) on delete restrict);
alter table qarar_topics.topic_type_category_links enable row level security;
alter table qarar_topics.topic_type_category_links force row level security;
revoke all on qarar_topics.topic_type_category_links from public,anon,authenticated,service_role;
grant select,insert on qarar_topics.topic_type_category_links to qarar_topics_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('topic_type_category_links','topics',false);
alter table qarar_governance.topic_governance_mappings alter column routing_decision_id drop not null;
alter table qarar_governance.topic_governance_mappings add column topic_type_version_id uuid,
 add constraint mapping_type_version_fk foreign key(topic_type_version_id,organization_id) references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict,
 add constraint mapping_governance_origin_check check(routing_decision_id is not null or topic_type_version_id is not null);

create function qarar_topics.protect_typed_topic_identity_v2() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.topic_type_version_id is distinct from new.topic_type_version_id or old.typed_creation_request is distinct from new.typed_creation_request then
  raise exception using errcode='23514',message='لا يمكن تغيير تصنيف موضوع سابق أو لقطة إنشائه'; end if;
 return new;
end $$;
create trigger protect_typed_topic_identity_v2 before update on qarar_topics.topics for each row execute function qarar_topics.protect_typed_topic_identity_v2();

create function qarar_governance.prepare_typed_topic_v2(p_version_id uuid,p_unit_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); tid uuid; result jsonb; option jsonb; wf uuid;
begin
 perform qarar_iam.assert_permission('topics.create',p_unit_id);
 select topic_type_id into tid from qarar_governance.topic_type_versions_v2 where id=p_version_id and organization_id=o;
 if tid is null then raise exception using errcode='P0002',message='التصنيف غير موجود'; end if;
 perform 1 from qarar_governance.topic_types_v2 where id=tid and organization_id=o for update;
 select x into option from jsonb_array_elements(qarar_governance.list_effective_topic_types_v2(p_unit_id,current_date)) x where (x->>'topic_type_version_id')::uuid=p_version_id;
 if option is null then raise exception using errcode='23514',message='التصنيف غير متاح للتقديم في المجلس المحدد'; end if;
 result:=qarar_governance.preview_topic_route_v2(p_version_id,p_unit_id,current_date);
 select workflow_template_version_id into wf from qarar_governance.topic_type_workflow_bindings_v2 where topic_type_version_id=p_version_id and organization_id=o and status='effective';
 if not exists(select 1 from qarar_governance.workflow_template_versions where id=wf and organization_id=o and status='active' and validation_status='valid') then raise exception using errcode='23514',message='مسار التصنيف غير متاح للتقديم'; end if;
 if jsonb_array_length(result->'steps')=0 or exists(select 1 from jsonb_array_elements(result->'steps') x where x->>'resolved_governance_unit_id' is null or not exists(select 1 from qarar_core.governance_units gu where gu.id=(x->>'resolved_governance_unit_id')::uuid and gu.organization_id=o and gu.status='active')) then
  raise exception using errcode='23514',message='أكمل تفعيل مجالس المسار قبل تقديم الموضوع'; end if;
 return result||option||jsonb_build_object('topic_type_id',tid,'workflow_template_version_id',wf);
end $$;

create function qarar_governance.attach_typed_topic_workflow_v2(p_topic_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); t qarar_topics.topics%rowtype; snap jsonb; wf uuid; mid uuid; iid uuid; first_step uuid;
begin
 select * into t from qarar_topics.topics where id=p_topic_id and organization_id=o;
 if t.id is null or t.submitted_by_user_id<>actor or t.topic_type_version_id is null or t.workflow_instance_id is not null then raise exception using errcode='42501',message='لا يمكن ربط هذا الموضوع بمسار تصنيف'; end if;
 snap:=qarar_governance.prepare_typed_topic_v2(t.topic_type_version_id,t.current_unit_id); wf:=(snap->>'workflow_template_version_id')::uuid;
 insert into qarar_governance.topic_governance_mappings(organization_id,topic_id,governance_source,routing_status,topic_type_version_id,workflow_template_version_id,snapshot,mapped_by_user_id)
 values(o,t.id,'regulated','routing_resolved',t.topic_type_version_id,wf,snap,actor) returning id into mid;
 insert into qarar_governance.workflow_instances(organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,started_by_user_id,snapshot)
 values(o,t.id,mid,wf,actor,snap) returning id into iid;
 insert into qarar_governance.workflow_instance_steps(organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,required_permission_code,opened_at,snapshot)
 select o,iid,s.id,s.sequence_no,case when s.is_initial then 'active' else 'pending' end,
 qarar_governance.resolve_step_unit(o,t.current_unit_id,s.governance_unit_id,s.governance_class_id),s.required_permission_code,case when s.is_initial then now() end,
 jsonb_build_object('step_code',s.step_code,'name_ar',s.name_ar,'responsibility',s.responsibility,'governance_unit_id',s.governance_unit_id,'governance_class_id',s.governance_class_id,'allowed_outcomes',s.allowed_outcomes)
 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=wf and s.organization_id=o;
 select wis.id into first_step from qarar_governance.workflow_instance_steps wis join qarar_governance.workflow_template_steps s on s.id=wis.template_step_id where wis.workflow_instance_id=iid and s.is_initial;
 if first_step is null then raise exception using errcode='23514',message='تعذر تحديد أول مرحلة للموضوع'; end if;
 update qarar_governance.workflow_instances set current_step_id=first_step where id=iid;
 perform qarar_topics.apply_governance_snapshot(t.id,'regulated','routing_ready',null,null,null,null,wf,iid,first_step,null);
 insert into qarar_governance.governance_compliance_events(organization_id,topic_id,workflow_instance_id,event_type,severity,result,details,actor_user_id)
 values(o,t.id,iid,'governance.workflow_instantiated','info','allowed',jsonb_build_object('topic_type_version_id',t.topic_type_version_id,'mapping_id',mid),actor);
 insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
 values(o,'topic',t.id,'governance.workflow.started',jsonb_build_object('topic_id',t.id,'workflow_instance_id',iid),'workflow-started:'||iid);
 return jsonb_build_object('topic_id',t.id,'workflow_instance_id',iid,'current_workflow_step_id',first_step,'routing_status','routing_ready');
end $$;

create function qarar_topics.create_topic_from_type_v2(p_title_ar text,p_description text,p_topic_type_version_id uuid,p_current_unit_id uuid,p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); request jsonb; snap jsonb; existing qarar_topics.topics%rowtype; tid uuid; cat uuid; topic uuid; number bigint; reference text; result jsonb; year integer:=extract(year from current_date);
begin
 perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
 if actor is null or o is null or p_client_request_id is null or p_topic_type_version_id is null or p_current_unit_id is null
 or char_length(btrim(coalesce(p_title_ar,''))) not between 5 and 300 or char_length(btrim(coalesce(p_description,''))) not between 10 and 10000 then
  raise exception using errcode='22023',message='أكمل عنوان الموضوع ووصفه ومجلسه وتصنيفه'; end if;
 request:=jsonb_build_object('title_ar',btrim(p_title_ar),'description',btrim(p_description),'topic_type_version_id',p_topic_type_version_id,'current_unit_id',p_current_unit_id);
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into existing from qarar_topics.topics where organization_id=o and submitted_by_user_id=actor and client_request_id=p_client_request_id;
 if existing.id is not null then
  if existing.typed_creation_request->'input' is distinct from request then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return jsonb_build_object('topic_id',existing.id,'topic_no',existing.topic_no,'idempotent_replay',true);
 end if;
 perform qarar_iam.consume_iam_rate_limit('topics.create',20,600);
 snap:=qarar_governance.prepare_typed_topic_v2(p_topic_type_version_id,p_current_unit_id); tid:=(snap->>'topic_type_id')::uuid;
 select category_id into cat from qarar_topics.topic_type_category_links where topic_type_id=tid and organization_id=o;
 if cat is null then
  insert into qarar_topics.topic_categories(organization_id,code,name_ar) values(o,'typed_'||replace(tid::text,'-',''),snap->>'topic_type_name_ar') returning id into cat;
  insert into qarar_topics.topic_type_category_links(topic_type_id,organization_id,category_id) values(tid,o,cat);
 end if;
 insert into qarar_topics.topic_number_counters(organization_id,calendar_year,last_value) values(o,year,1)
 on conflict(organization_id,calendar_year) do update set last_value=qarar_topics.topic_number_counters.last_value+1,updated_at=now() returning last_value into number;
 reference:=format('TOP-%s-%s',year,lpad(number::text,6,'0'));
 insert into qarar_topics.topics(organization_id,topic_no,title_ar,description,category_id,current_unit_id,submitted_by_user_id,status,submitted_at,client_request_id,topic_type_version_id,typed_creation_request)
 values(o,reference,btrim(p_title_ar),btrim(p_description),cat,p_current_unit_id,actor,'new',now(),p_client_request_id,p_topic_type_version_id,jsonb_build_object('input',request,'snapshot',snap)) returning id into topic;
 insert into qarar_topics.topic_status_history(organization_id,topic_id,from_status,to_status,changed_by_user_id,change_reason) values(o,topic,null,'new',actor,'تقديم موضوع بتصنيف معتمد');
 result:=qarar_governance.attach_typed_topic_workflow_v2(topic);
 perform qarar_audit.append_audit_log(o,'topics.create','topics',topic,jsonb_build_object('topic_no',reference,'topic_type_version_id',p_topic_type_version_id,'client_request_id',p_client_request_id));
 return result||jsonb_build_object('topic_no',reference,'idempotent_replay',false);
end $$;

alter function qarar_topics.create_topic_unrouted(text,text,uuid,uuid,text,text,text,uuid) rename to create_topic_unrouted_before_types;
create function qarar_topics.create_topic_unrouted(p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,p_priority text default 'medium',p_source_type text default 'new',p_title_en text default null,p_client_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
 if exists(select 1 from qarar_topics.topic_type_category_links where category_id=p_category_id and organization_id=qarar_iam.current_organization_id()) then raise exception using errcode='23514',message='قدّم هذا الموضوع من واجهة التصنيفات المعتمدة'; end if;
 return qarar_topics.create_topic_unrouted_before_types(p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,p_source_type,p_title_en,p_client_request_id);
end $$;
alter function qarar_topics.get_topic_requirements_status(uuid) rename to get_topic_requirements_before_types;
create function qarar_topics.get_topic_requirements_status(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; needed integer; uploaded integer; item jsonb;
begin
 result:=qarar_topics.get_topic_requirements_before_types(p_topic_id);
 select (typed_creation_request#>>'{snapshot,authoring,required_attachment_count}')::integer into needed from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
 if coalesce(needed,0)=0 then return result; end if;
 select count(*) into uploaded from qarar_topics.topic_attachments where topic_id=p_topic_id and organization_id=qarar_iam.current_organization_id();
 item:=jsonb_build_object('code','type_attachment_minimum','name','مرفقات التصنيف: '||uploaded||' من '||needed,'type','document','mandatory',true,'timing','before_submission','status',case when uploaded>=needed then 'fulfilled' else 'pending' end);
 return result||jsonb_build_object('items',result->'items'||jsonb_build_array(item),'total',(result->>'total')::integer+1,
 'missing_mandatory',(result->>'missing_mandatory')::integer+case when uploaded>=needed then 0 else 1 end,'ready_for_review',(result->>'ready_for_review')::boolean and uploaded>=needed);
end $$;

create function api_v2.prepare_typed_topic_v2(p_version_id uuid,p_unit_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin result:=qarar_governance.prepare_typed_topic_v2(p_version_id,p_unit_id); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $$;
create function api_v2.create_topic_from_type_v2(p_title_ar text,p_description text,p_topic_type_version_id uuid,p_current_unit_id uuid,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin result:=qarar_topics.create_topic_from_type_v2(p_title_ar,p_description,p_topic_type_version_id,p_current_unit_id,p_client_request_id); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $$;

update qarar_architecture.function_registry r set function_name=p.proname from pg_proc p where p.oid=r.function_oid and p.proname in ('create_topic_unrouted_before_types','get_topic_requirements_before_types');
do $$ declare f record; executor text; module text; begin
 for f in select p.oid,p.proname,n.nspname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='qarar_topics' and p.proname in ('protect_typed_topic_identity_v2','create_topic_from_type_v2','create_topic_unrouted','get_topic_requirements_status')) or (n.nspname='qarar_governance' and p.proname in ('prepare_typed_topic_v2','attach_typed_topic_workflow_v2')) loop
  module:=case when f.nspname='qarar_topics' then 'topics' else 'governance' end; executor:='qarar_'||module||'_executor';
  execute format('alter function %I.%I(%s) owner to %I',f.nspname,f.proname,f.args,executor);
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
  execute format('grant execute on function %I.%I(%s) to %I',f.nspname,f.proname,f.args,executor);
  if f.proname in ('create_topic_from_type_v2','prepare_typed_topic_v2') then execute format('grant execute on function %I.%I(%s) to qarar_api_executor',f.nspname,f.proname,f.args); end if;
  insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values(f.oid,f.proname,f.args,module,f.nspname,false);
 end loop;
 for f in select oid,proname,pg_get_function_identity_arguments(oid) args from pg_proc where pronamespace='api_v2'::regnamespace and proname in ('prepare_typed_topic_v2','create_topic_from_type_v2') loop
  execute format('alter function api_v2.%I(%s) owner to qarar_api_executor',f.proname,f.args);
  execute format('revoke all on function api_v2.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function api_v2.%I(%s) to authenticated,qarar_api_executor',f.proname,f.args);
  insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
  values('v2',f.proname,case when f.proname='create_topic_from_type_v2' then 'qarar_topics' else 'qarar_governance' end,f.proname,f.args,case when f.proname='create_topic_from_type_v2' then 'topics' else 'governance' end,'authenticated');
 end loop;
end $$;
grant execute on function qarar_governance.prepare_typed_topic_v2(uuid,uuid),qarar_governance.attach_typed_topic_workflow_v2(uuid) to qarar_topics_executor;
grant execute on function qarar_topics.get_topic_requirements_status(uuid) to qarar_api_executor,qarar_governance_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
('topics','qarar_governance','prepare_typed_topic_v2','p_version_id uuid, p_unit_id uuid','Lock and validate the explicitly selected type snapshot'),
('topics','qarar_governance','attach_typed_topic_workflow_v2','p_topic_id uuid','Instantiate the explicitly selected immutable type route') on conflict do nothing;
grant execute on function api_v2.list_effective_topic_types_v2(uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
