begin;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
 ('topics','qarar_governance','policies','Validate topic regulation references'),
 ('topics','qarar_governance','policy_versions','Validate effective policy versions'),
 ('topics','qarar_governance','policy_items','Resolve referenced policy provisions'),
 ('topics','qarar_governance','topic_regulation_references','Persist and render the governed regulation reference set'),
 ('topics','qarar_meetings','meetings','Render the topic meeting history'),
 ('topics','qarar_meetings','agenda_items','Render the topic agenda history'),
 ('topics','qarar_voting','voting_rounds','Render voting outcomes in topic history'),
 ('topics','qarar_decisions','decisions','Render decisions created for a topic')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('governance','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Authorize tenant-scoped governance summary reads')
on conflict do nothing;
grant usage on schema qarar_governance,qarar_meetings,qarar_voting,qarar_decisions to qarar_topics_executor;
grant select on qarar_governance.policies,qarar_governance.policy_versions,qarar_governance.policy_items,
  qarar_meetings.meetings,qarar_meetings.agenda_items,qarar_voting.voting_rounds,
  qarar_decisions.decisions to qarar_topics_executor;
grant execute on function qarar_iam.has_permission(text,uuid) to qarar_governance_executor;

-- A topic has one authoritative regulation selection that drives routing, while
-- any number of additional policy/chapter/article/clause references may explain
-- the legal basis of the request.
create table if not exists qarar_governance.topic_regulation_references (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  policy_id uuid not null,
  policy_version_id uuid not null,
  policy_item_id uuid,
  scope_assignment_id uuid,
  reference_type text not null,
  is_primary boolean not null default false,
  label_snapshot text not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),
  foreign key(topic_id,organization_id) references qarar_topics.topics(id,organization_id) on delete cascade,
  foreign key(policy_id,organization_id) references qarar_governance.policies(id,organization_id) on delete restrict,
  foreign key(policy_version_id,organization_id) references qarar_governance.policy_versions(id,organization_id) on delete restrict,
  foreign key(policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete restrict,
  foreign key(scope_assignment_id,organization_id) references qarar_governance.policy_scope_assignments(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(reference_type in('policy','chapter','section','article','clause','procedure')),
  check(char_length(btrim(label_snapshot)) between 2 and 500)
);
create unique index if not exists topic_regulation_one_primary_idx
  on qarar_governance.topic_regulation_references(topic_id) where is_primary;
create unique index if not exists topic_regulation_reference_identity_idx
  on qarar_governance.topic_regulation_references(
    topic_id,policy_id,policy_version_id,coalesce(policy_item_id,'00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table qarar_governance.topic_regulation_references enable row level security;
revoke all on qarar_governance.topic_regulation_references from public,anon,authenticated;
grant select,insert,update,delete on qarar_governance.topic_regulation_references to qarar_topics_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('topic_regulation_references','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=excluded.legacy_public_view;

create or replace function qarar_topics.save_topic_regulation_references(
  p_topic_id uuid,p_references jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_unit uuid;v_mapping record;v_ref jsonb;v_count int:=0;v_primary int:=0;
  v_policy_name text;v_item record;v_type text;v_label text;
begin
  if v_org is null or auth.uid() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
  if jsonb_typeof(coalesce(p_references,'[]'::jsonb))<>'array' then
    raise exception using errcode='22023',message='قائمة المراجع النظامية غير صالحة';
  end if;
  select current_unit_id into v_unit from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org for update;
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  perform qarar_iam.assert_permission('topics.create',v_unit);
  select policy_id,policy_version_id,policy_item_id,policy_scope_assignment_id into v_mapping
  from qarar_governance.topic_governance_mappings where topic_id=p_topic_id and organization_id=v_org;
  if v_mapping.policy_id is null then raise exception using errcode='23514',message='لا يمكن حفظ مراجع لائحية قبل تحديد المرجع الحاكم';end if;
  v_count:=jsonb_array_length(p_references);
  if v_count<1 or v_count>50 then raise exception using errcode='22023',message='يجب تحديد مرجع حاكم واحد وبحد أقصى 50 مرجعًا';end if;
  select count(*) into v_primary from jsonb_array_elements(p_references) r where coalesce((r->>'is_primary')::boolean,false);
  if v_primary<>1 then raise exception using errcode='23514',message='يجب تحديد مرجع حاكم واحد فقط';end if;

  delete from qarar_governance.topic_regulation_references where topic_id=p_topic_id and organization_id=v_org;
  for v_ref in select value from jsonb_array_elements(p_references) loop
    if coalesce((v_ref->>'is_primary')::boolean,false) and (
      (v_ref->>'policy_id')::uuid is distinct from v_mapping.policy_id
      or (v_ref->>'policy_version_id')::uuid is distinct from v_mapping.policy_version_id
      or nullif(v_ref->>'policy_item_id','')::uuid is distinct from v_mapping.policy_item_id
    ) then
      raise exception using errcode='23514',message='المرجع الحاكم يجب أن يطابق المادة التي بُني عليها مسار الموضوع';
    end if;
    select p.name_ar into v_policy_name from qarar_governance.policies p
      join qarar_governance.policy_versions pv on pv.policy_id=p.id and pv.organization_id=p.organization_id
      where p.id=(v_ref->>'policy_id')::uuid and pv.id=(v_ref->>'policy_version_id')::uuid
        and p.organization_id=v_org and p.status='active' and pv.status in('published','effective');
    if v_policy_name is null then raise exception using errcode='P0002',message='اللائحة المرجعية غير موجودة';end if;
    v_item:=null;
    if nullif(v_ref->>'policy_item_id','') is not null then
      select id,item_type,title_ar into v_item from qarar_governance.policy_items
      where id=(v_ref->>'policy_item_id')::uuid and policy_version_id=(v_ref->>'policy_version_id')::uuid
        and organization_id=v_org;
      if v_item.id is null then raise exception using errcode='23514',message='البند المرجعي لا ينتمي إلى الإصدار المختار';end if;
    end if;
    v_type:=coalesce(nullif(v_ref->>'reference_type',''),case when v_item.id is null then 'policy' else v_item.item_type end);
    v_label:=coalesce(nullif(btrim(v_ref->>'label'),''),v_item.title_ar,v_policy_name);
    insert into qarar_governance.topic_regulation_references(
      organization_id,topic_id,policy_id,policy_version_id,policy_item_id,scope_assignment_id,
      reference_type,is_primary,label_snapshot,created_by_user_id
    ) values(
      v_org,p_topic_id,(v_ref->>'policy_id')::uuid,(v_ref->>'policy_version_id')::uuid,
      nullif(v_ref->>'policy_item_id','')::uuid,nullif(v_ref->>'scope_assignment_id','')::uuid,
      v_type,coalesce((v_ref->>'is_primary')::boolean,false),v_label,auth.uid()
    );
  end loop;
  perform qarar_audit.append_audit_log(v_org,'topic.regulation.references.save','topics',p_topic_id,
    jsonb_build_object('reference_count',v_count));
  return jsonb_build_object('topic_id',p_topic_id,'reference_count',v_count);
end $$;

create or replace function qarar_topics.list_topic_regulation_references(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_unit uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics
    where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'policy_id',r.policy_id,'policy_version_id',r.policy_version_id,'policy_item_id',r.policy_item_id,
    'scope_assignment_id',r.scope_assignment_id,'reference_type',r.reference_type,'is_primary',r.is_primary,
    'label',r.label_snapshot,'policy_name',p.name_ar,'version_no',v.version_no,'item_code',i.code,'item_title',i.title_ar
  ) order by r.is_primary desc,r.created_at)
  from qarar_governance.topic_regulation_references r
  join qarar_governance.policies p on p.id=r.policy_id
  join qarar_governance.policy_versions v on v.id=r.policy_version_id
  left join qarar_governance.policy_items i on i.id=r.policy_item_id
  where r.topic_id=p_topic_id and r.organization_id=qarar_iam.current_organization_id()),'[]'::jsonb);
end $$;

create or replace function qarar_topics.create_topic_with_regulation_bundle(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_scope_assignment_id uuid,
  p_references jsonb,p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare v_result jsonb;v_topic_id uuid;
begin
  if qarar_iam.current_organization_id() is null or auth.uid() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط';
  end if;
  v_result:=qarar_topics.create_topic_with_selected_regulation(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,p_priority,p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=coalesce(v_result->>'topic_id',v_result->>'id')::uuid;
  perform qarar_topics.save_topic_regulation_references(v_topic_id,p_references);
  return v_result||jsonb_build_object('topic_id',v_topic_id,'regulation_references',p_references);
end $$;

-- Requirements are first-class completion records. Documents satisfy them when
-- uploaded against a requirement; data/declarations can be confirmed explicitly.
alter table qarar_topics.topic_attachments add column if not exists requirement_code text;
create table if not exists qarar_topics.topic_requirement_fulfillments(
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  requirement_code text not null,
  status text not null default 'fulfilled',
  evidence_attachment_id uuid,
  note text,
  fulfilled_by_user_id uuid,
  fulfilled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(topic_id,requirement_code),
  foreign key(topic_id,organization_id) references qarar_topics.topics(id,organization_id) on delete cascade,
  foreign key(evidence_attachment_id,organization_id) references qarar_topics.topic_attachments(id,organization_id) on delete set null,
  foreign key(fulfilled_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(status in('pending','fulfilled','waived')),
  check(note is null or char_length(btrim(note))<=2000)
);
alter table qarar_topics.topic_requirement_fulfillments enable row level security;
revoke all on qarar_topics.topic_requirement_fulfillments from public,anon,authenticated;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('topic_requirement_fulfillments','topics',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=excluded.legacy_public_view;
grant select,insert,update,delete on qarar_topics.topic_requirement_fulfillments to qarar_topics_executor;
grant select,insert,update,delete on qarar_topics.topic_attachments to qarar_topics_executor;
grant select on qarar_governance.policy_rules,qarar_governance.rule_requirements to qarar_topics_executor;

create or replace function qarar_topics.get_topic_requirements_status(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_unit uuid;v_item uuid;v_items jsonb;
begin
  select current_unit_id,policy_item_id into v_unit,v_item from qarar_topics.topics
    where id=p_topic_id and organization_id=v_org;
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'name',x.name_ar,'type',x.requirement_type,'mandatory',x.is_mandatory,'timing',x.timing,
    'status',case when f.status in('fulfilled','waived') then f.status else 'pending' end,
    'note',f.note,'attachment_id',f.evidence_attachment_id
  ) order by x.priority desc,x.sequence_no),'[]'::jsonb) into v_items
  from (
    select r.rule_code||':'||q.requirement_code code,q.name_ar,q.requirement_type,q.is_mandatory,q.timing,
      r.priority,q.sequence_no
    from qarar_governance.policy_rules r join qarar_governance.rule_requirements q
      on q.policy_rule_id=r.id and q.organization_id=r.organization_id
    where r.policy_item_id=v_item and r.organization_id=v_org and r.status='active'
      and (r.valid_from is null or current_date>=r.valid_from) and (r.valid_to is null or current_date<=r.valid_to)
  ) x left join qarar_topics.topic_requirement_fulfillments f
    on f.topic_id=p_topic_id and f.organization_id=v_org and f.requirement_code=x.code;
  return jsonb_build_object('items',v_items,'total',jsonb_array_length(v_items),
    'missing_mandatory',(select count(*) from jsonb_array_elements(v_items) i
      where coalesce((i->>'mandatory')::boolean,false) and i->>'status'='pending'),
    'ready_for_review',not exists(select 1 from jsonb_array_elements(v_items) i
      where coalesce((i->>'mandatory')::boolean,false) and i->>'status'='pending'
        and i->>'timing' in('before_submission','before_review')));
end $$;

create or replace function qarar_topics.assert_topic_requirements_ready(p_topic_id uuid,p_phase text)
returns void language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_status jsonb;v_missing text;
begin
  v_status:=qarar_topics.get_topic_requirements_status(p_topic_id);
  select string_agg(i->>'name','، ') into v_missing from jsonb_array_elements(v_status->'items') i
  where coalesce((i->>'mandatory')::boolean,false) and i->>'status'='pending' and (
    (p_phase='before_submission' and i->>'timing'='before_submission') or
    (p_phase='before_review' and i->>'timing' in('before_submission','before_review')) or
    (p_phase='before_decision' and i->>'timing' in('before_submission','before_review','before_decision'))
  );
  if v_missing is not null then raise exception using errcode='23514',
    message='لا يمكن متابعة الإجراء قبل استكمال المتطلبات الإلزامية: '||v_missing;end if;
end $$;

create or replace function qarar_topics.fulfill_topic_requirement(
  p_topic_id uuid,p_requirement_code text,p_note text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_unit uuid;v_item uuid;v_type text;v_id uuid;
begin
  select current_unit_id,policy_item_id into v_unit,v_item from qarar_topics.topics
    where id=p_topic_id and organization_id=v_org for update;
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  select q.requirement_type into v_type from qarar_governance.policy_rules r
    join qarar_governance.rule_requirements q on q.policy_rule_id=r.id and q.organization_id=r.organization_id
  where r.policy_item_id=v_item and r.organization_id=v_org and r.status='active'
    and r.rule_code||':'||q.requirement_code=p_requirement_code;
  if v_type is null then raise exception using errcode='P0002',message='المتطلب غير موجود للمادة الحاكمة';end if;
  if v_type in('document','evidence') then raise exception using errcode='23514',message='يكتمل هذا المتطلب برفع المستند المطلوب';end if;
  if v_type in('approval','fee') then perform qarar_iam.assert_permission('topics.review',v_unit);
  else perform qarar_iam.assert_permission('topics.create',v_unit);end if;
  insert into qarar_topics.topic_requirement_fulfillments(
    organization_id,topic_id,requirement_code,status,note,fulfilled_by_user_id,fulfilled_at
  ) values(v_org,p_topic_id,p_requirement_code,'fulfilled',nullif(btrim(coalesce(p_note,'')),''),auth.uid(),clock_timestamp())
  on conflict(topic_id,requirement_code) do update set status='fulfilled',note=excluded.note,
    fulfilled_by_user_id=excluded.fulfilled_by_user_id,fulfilled_at=excluded.fulfilled_at,updated_at=clock_timestamp()
  returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'topic.requirement.fulfill','topics',p_topic_id,
    jsonb_build_object('requirement_code',p_requirement_code));
  return jsonb_build_object('id',v_id,'requirement_code',p_requirement_code,'status','fulfilled');
end $$;

create or replace function qarar_topics.add_topic_attachment(
  p_topic_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,
  p_description text,p_requirement_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare v_result jsonb;v_attachment uuid;v_type text;v_item uuid;
begin
  if nullif(btrim(coalesce(p_requirement_code,'')),'') is not null then
    select policy_item_id into v_item from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
    select q.requirement_type into v_type from qarar_governance.policy_rules r
      join qarar_governance.rule_requirements q on q.policy_rule_id=r.id and q.organization_id=r.organization_id
    where r.policy_item_id=v_item and r.organization_id=qarar_iam.current_organization_id() and r.status='active'
      and r.rule_code||':'||q.requirement_code=p_requirement_code;
    if v_type not in('document','evidence') then raise exception using errcode='23514',message='المتطلب المختار لا يكتمل برفع ملف';end if;
  end if;
  v_result:=qarar_topics.add_topic_attachment(p_topic_id,p_file_name,p_file_url,p_mime_type,p_file_size_bytes,p_description);
  v_attachment:=(v_result->>'id')::uuid;
  update qarar_topics.topic_attachments set requirement_code=nullif(btrim(coalesce(p_requirement_code,'')),'') where id=v_attachment;
  if nullif(btrim(coalesce(p_requirement_code,'')),'') is not null then
    insert into qarar_topics.topic_requirement_fulfillments(
      organization_id,topic_id,requirement_code,status,evidence_attachment_id,fulfilled_by_user_id,fulfilled_at
    ) values(qarar_iam.current_organization_id(),p_topic_id,p_requirement_code,'fulfilled',v_attachment,auth.uid(),clock_timestamp())
    on conflict(topic_id,requirement_code) do update set status='fulfilled',evidence_attachment_id=excluded.evidence_attachment_id,
      fulfilled_by_user_id=excluded.fulfilled_by_user_id,fulfilled_at=excluded.fulfilled_at,updated_at=clock_timestamp();
  end if;
  return v_result||jsonb_build_object('requirement_code',nullif(btrim(coalesce(p_requirement_code,'')),''));
end $$;

create or replace function qarar_topics.remove_topic_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare v_attachment qarar_topics.topic_attachments%rowtype;v_unit uuid;
begin
  select * into v_attachment from qarar_topics.topic_attachments
    where id=p_attachment_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_attachment.id is null then raise exception using errcode='P0002',message='المرفق غير موجود';end if;
  select current_unit_id into v_unit from qarar_topics.topics where id=v_attachment.topic_id;
  perform qarar_iam.assert_permission('topics.create',v_unit);
  update qarar_topics.topic_requirement_fulfillments set status='pending',evidence_attachment_id=null,
    fulfilled_by_user_id=null,fulfilled_at=null,updated_at=clock_timestamp()
    where evidence_attachment_id=v_attachment.id;
  delete from qarar_topics.topic_attachments where id=v_attachment.id;
  perform qarar_audit.append_audit_log(qarar_iam.current_organization_id(),'topic.attachment.remove','topic_attachments',
    v_attachment.id,jsonb_build_object('topic_id',v_attachment.topic_id));
  return jsonb_build_object('id',v_attachment.id,'deleted',true);
end $$;

-- Review approval is impossible while mandatory submission/review evidence is missing.
do $$
begin
  if to_regprocedure('qarar_topics.review_topic_core(uuid,text,text,timestamptz)') is null then
    alter function qarar_topics.review_topic(uuid,text,text,timestamptz) rename to review_topic_core;
  end if;
end $$;
create or replace function qarar_topics.review_topic(
  p_topic_id uuid,p_action text,p_reason text default null,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare v_unit_id uuid;
begin
  select current_unit_id into v_unit_id from qarar_topics.topics
  where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
  if not found then raise exception using errcode='P0002',message='topic not found in current organization';end if;
  -- Authorize before exposing requirement/readiness details. The guarded core
  -- repeats this check, but it must also precede the new precondition layer.
  perform qarar_iam.assert_permission('topics.review',v_unit_id);
  if p_action='start_review' then perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_submission');end if;
  if p_action='approve' then perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_review');end if;
  return qarar_topics.review_topic_core(p_topic_id,p_action,p_reason,p_expected_updated_at);
end $$;

-- Governance workflow steps and topic review are one lifecycle. Advancing the
-- first review step starts/approves the topic review; voting/discussion remains
-- owned by the meeting runtime and cannot be completed from the review screen.
do $$
begin
  if to_regprocedure('qarar_governance.act_topic_workflow_step_guarded_core(uuid,text,text,uuid,integer)') is null then
    alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
      rename to act_topic_workflow_step_guarded_core;
  end if;
end $$;
create or replace function qarar_governance.act_topic_workflow_step(
  p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_topic qarar_topics.topics%rowtype;v_step record;v_result jsonb;
begin
  select * into v_topic from qarar_topics.topics
    where id=p_topic_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_topic.id is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  select s.id,s.status,ts.step_type,ts.responsibility into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id and s.workflow_instance_id=v_topic.workflow_instance_id;
  if v_step.id is null or v_step.status<>'active' then raise exception using errcode='55000',message='لا توجد خطوة حوكمة نشطة للموضوع';end if;
  if v_step.step_type in('discussion','voting') or v_step.responsibility in('present','discuss','recommend','initial_approve','final_approve') then
    raise exception using errcode='55000',message='هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;
  if v_step.step_type='review' or v_step.responsibility='review' then
    perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_review');
    if v_topic.status='new' then
      perform qarar_topics.review_topic(p_topic_id,'start_review',null,v_topic.updated_at);
      select * into v_topic from qarar_topics.topics where id=p_topic_id for update;
    end if;
    if p_outcome_code in('approved','completed') and v_topic.status='under_review' then
      perform qarar_topics.review_topic(p_topic_id,'approve',p_comment,v_topic.updated_at);
    elsif p_outcome_code='rejected' and v_topic.status in('new','under_review') then
      perform qarar_topics.review_topic(p_topic_id,'reject',p_comment,v_topic.updated_at);
    end if;
  end if;
  v_result:=qarar_governance.act_topic_workflow_step_guarded_core(
    p_topic_id,p_outcome_code,p_comment,p_idempotency_key,p_expected_version
  );
  return v_result||jsonb_build_object('topic_status',(select status from qarar_topics.topics where id=p_topic_id));
end $$;

-- The candidate query now mirrors the authoritative agenda trigger exactly.
create or replace function qarar_meetings.search_eligible_agenda_topics(
  p_meeting_id uuid,p_query text default null,p_limit int default 25,p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_meetings as $$
declare v_m qarar_meetings.meetings%rowtype;v_limit int:=least(greatest(coalesce(p_limit,25),1),100);v_offset int:=greatest(coalesce(p_offset,0),0);
begin
  select * into v_m from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود';end if;
  perform qarar_iam.assert_permission('agenda.manage',v_m.governance_unit_id);
  if v_m.status not in('draft','scheduled') then return jsonb_build_object('items','[]'::jsonb,'total',0,'locked',true,'limit',v_limit,'offset',v_offset);end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'topic_no',q.topic_no,'title_ar',q.title_ar,'priority',q.priority,'status',q.status,
    'updated_at',q.updated_at,'current_step',q.step_name,'responsibility',q.responsibility
  ) order by q.created_at desc) from (
    select t.*,s.snapshot->>'name_ar' step_name,s.snapshot->>'responsibility' responsibility
    from qarar_topics.topics t left join qarar_governance.workflow_instance_steps s
      on s.id=t.current_workflow_step_id and s.workflow_instance_id=t.workflow_instance_id and s.status='active'
    where t.organization_id=v_m.organization_id and t.current_unit_id=v_m.governance_unit_id and t.status='approved'
      and not exists(select 1 from qarar_meetings.agenda_items ai where ai.meeting_id=v_m.id and ai.topic_id=t.id)
      and (t.governance_source='legacy' or (
        t.routing_status='routing_ready' and t.workflow_instance_id is not null and t.current_workflow_step_id is not null
        and s.assigned_unit_id=v_m.governance_unit_id
        and s.snapshot->>'responsibility' in('present','discuss','recommend','initial_approve','final_approve')
      ))
      and (nullif(btrim(p_query),'') is null or t.topic_no ilike '%'||btrim(p_query)||'%' or t.title_ar ilike '%'||btrim(p_query)||'%')
    order by t.created_at desc limit v_limit offset v_offset
  ) q),'[]'::jsonb),
  'total',(select count(*) from qarar_topics.topics t left join qarar_governance.workflow_instance_steps s
    on s.id=t.current_workflow_step_id and s.workflow_instance_id=t.workflow_instance_id and s.status='active'
    where t.organization_id=v_m.organization_id and t.current_unit_id=v_m.governance_unit_id and t.status='approved'
      and not exists(select 1 from qarar_meetings.agenda_items ai where ai.meeting_id=v_m.id and ai.topic_id=t.id)
      and (t.governance_source='legacy' or (t.routing_status='routing_ready' and t.workflow_instance_id is not null
        and t.current_workflow_step_id is not null and s.assigned_unit_id=v_m.governance_unit_id
        and s.snapshot->>'responsibility' in('present','discuss','recommend','initial_approve','final_approve')))
      and (nullif(btrim(p_query),'') is null or t.topic_no ilike '%'||btrim(p_query)||'%' or t.title_ar ilike '%'||btrim(p_query)||'%')),
  'locked',false,'limit',v_limit,'offset',v_offset);
end $$;

-- Voting cannot begin before requirements due before the decision are complete.
create or replace function qarar_voting.enforce_topic_requirements_before_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_voting as $$
declare v_topic uuid;
begin
  select topic_id into v_topic from qarar_meetings.agenda_items
    where id=new.agenda_item_id and organization_id=new.organization_id;
  if v_topic is not null then perform qarar_topics.assert_topic_requirements_ready(v_topic,'before_decision');end if;
  return new;
end $$;
drop trigger if exists voting_round_topic_requirements_guard on qarar_voting.voting_rounds;
create trigger voting_round_topic_requirements_guard before insert on qarar_voting.voting_rounds
for each row execute function qarar_voting.enforce_topic_requirements_before_vote();

create or replace function qarar_topics.get_topic_meeting_history(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_unit uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics
    where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'agenda_item_id',a.id,'agenda_status',a.agenda_status,'discussion_notes',a.discussion_notes,
    'meeting',jsonb_build_object('id',m.id,'meeting_no',m.meeting_no,'title',m.title_ar,'status',m.status,
      'scheduled_date',m.scheduled_date,'unit_name',u.name_ar),
    'voting_rounds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',vr.id,'round_number',vr.round_number,'status',vr.status,'result',vr.result,
      'eligible_voter_count',vr.eligible_voter_count,'approve_count',vr.approve_count,
      'reject_count',vr.reject_count,'abstain_count',vr.abstain_count,'opened_at',vr.opened_at,'closed_at',vr.closed_at
    ) order by vr.round_number) from qarar_voting.voting_rounds vr where vr.agenda_item_id=a.id),'[]'::jsonb),
    'decisions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'decision_no',d.decision_no,'decision_text',d.decision_text,
      'decision_status',d.decision_status,'requires_approval',d.requires_approval,'issued_at',d.issued_at
    ) order by d.created_at) from qarar_decisions.decisions d where d.agenda_item_id=a.id),'[]'::jsonb)
  ) order by m.scheduled_date desc,m.created_at desc)
  from qarar_meetings.agenda_items a join qarar_meetings.meetings m on m.id=a.meeting_id
  join qarar_core.governance_units u on u.id=m.governance_unit_id
  where a.topic_id=p_topic_id and a.organization_id=qarar_iam.current_organization_id()),'[]'::jsonb);
end $$;

-- Owners and least-privilege cross-module execution.
alter function qarar_topics.save_topic_regulation_references(uuid,jsonb) owner to qarar_topics_executor;
alter function qarar_topics.list_topic_regulation_references(uuid) owner to qarar_topics_executor;
alter function qarar_topics.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_topics_executor;
alter function qarar_topics.get_topic_requirements_status(uuid) owner to qarar_topics_executor;
alter function qarar_topics.assert_topic_requirements_ready(uuid,text) owner to qarar_topics_executor;
alter function qarar_topics.fulfill_topic_requirement(uuid,text,text) owner to qarar_topics_executor;
alter function qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text,text) owner to qarar_topics_executor;
alter function qarar_topics.review_topic(uuid,text,text,timestamptz) owner to qarar_topics_executor;
alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) to qarar_api_executor,qarar_voting_executor;
alter function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) owner to qarar_meetings_executor;
alter function qarar_voting.enforce_topic_requirements_before_vote() owner to qarar_voting_executor;
alter function qarar_topics.get_topic_meeting_history(uuid) owner to qarar_topics_executor;
revoke all on function qarar_topics.assert_topic_requirements_ready(uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.assert_topic_requirements_ready(uuid,text) to qarar_voting_executor,qarar_governance_executor;
-- api_v1 facades are owned by qarar_api_executor and therefore need an
-- explicit implementation grant. Do not rely on PUBLIC EXECUTE, which Phase 0
-- deliberately revokes from every internal schema.
grant execute on function
  qarar_topics.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  qarar_topics.list_topic_regulation_references(uuid),
  qarar_topics.get_topic_requirements_status(uuid),
  qarar_topics.fulfill_topic_requirement(uuid,text,text),
  qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text),
  qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text,text),
  qarar_topics.review_topic(uuid,text,text,timestamptz),
  qarar_topics.get_topic_meeting_history(uuid)
to qarar_api_executor;
grant execute on function qarar_topics.review_topic(uuid,text,text,timestamptz) to qarar_governance_executor;
grant update on qarar_topics.topics to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values('voting','qarar_topics','assert_topic_requirements_ready','p_topic_id uuid, p_phase text',
  'Block voting until mandatory topic requirements due before decision are complete')
on conflict do nothing;
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('topics','qarar_governance','policy_rules','Resolve the active rules that govern a topic requirement checklist'),
('topics','qarar_governance','rule_requirements','Resolve mandatory topic evidence before review and decision')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
('governance','qarar_topics','assert_topic_requirements_ready','p_topic_id uuid, p_phase text',
 'Require topic evidence before advancing a governance review step'),
('governance','qarar_topics','review_topic','p_topic_id uuid, p_action text, p_reason text, p_expected_updated_at timestamp with time zone',
 'Keep topic review state synchronized with the governed workflow')
on conflict do nothing;

-- Public API facades.
create or replace function api_v1.create_topic_with_regulation_bundle(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,p_policy_id uuid,
  p_policy_version_id uuid,p_policy_item_id uuid,p_scope_assignment_id uuid,p_references jsonb,
  p_priority text default 'medium',p_source_type text default 'new',p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language sql security definer set search_path=pg_catalog as $$
  select qarar_topics.create_topic_with_regulation_bundle($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
$$;
create or replace function api_v1.list_topic_regulation_references(p_topic_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.list_topic_regulation_references($1)$$;
create or replace function api_v1.get_topic_requirements_status(p_topic_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.get_topic_requirements_status($1)$$;
create or replace function api_v1.fulfill_topic_requirement(p_topic_id uuid,p_requirement_code text,p_note text default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_topics.fulfill_topic_requirement($1,$2,$3)$$;
create or replace function api_v1.add_topic_attachment(
  p_topic_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,p_description text,p_requirement_code text
) returns jsonb language sql security definer set search_path=pg_catalog as $$
  select qarar_topics.add_topic_attachment($1,$2,$3,$4,$5,$6,$7)
$$;
create or replace function api_v1.review_topic(p_topic_id uuid,p_action text,p_reason text default null,p_expected_updated_at timestamptz default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_topics.review_topic($1,$2,$3,$4)$$;
create or replace function api_v1.get_topic_meeting_history(p_topic_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.get_topic_meeting_history($1)$$;

alter function api_v1.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_api_executor;
alter function api_v1.list_topic_regulation_references(uuid) owner to qarar_api_executor;
alter function api_v1.get_topic_requirements_status(uuid) owner to qarar_api_executor;
alter function api_v1.fulfill_topic_requirement(uuid,text,text) owner to qarar_api_executor;
alter function api_v1.add_topic_attachment(uuid,text,text,text,bigint,text,text) owner to qarar_api_executor;
alter function api_v1.review_topic(uuid,text,text,timestamptz) owner to qarar_api_executor;
alter function api_v1.get_topic_meeting_history(uuid) owner to qarar_api_executor;

grant execute on function api_v1.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.list_topic_regulation_references(uuid),api_v1.get_topic_requirements_status(uuid),
  api_v1.fulfill_topic_requirement(uuid,text,text),api_v1.add_topic_attachment(uuid,text,text,text,bigint,text,text),
  api_v1.review_topic(uuid,text,text,timestamptz),api_v1.get_topic_meeting_history(uuid) to authenticated,service_role;
revoke execute on function api_v1.create_topic_with_regulation_bundle(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.list_topic_regulation_references(uuid),api_v1.get_topic_requirements_status(uuid),
  api_v1.fulfill_topic_requirement(uuid,text,text),api_v1.add_topic_attachment(uuid,text,text,text,bigint,text,text),
  api_v1.review_topic(uuid,text,text,timestamptz),api_v1.get_topic_meeting_history(uuid) from public,anon;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  case when n.nspname='qarar_meetings' then 'meetings' when n.nspname='qarar_voting' then 'voting' else 'topics' end,
  n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='qarar_topics' and p.proname in('save_topic_regulation_references','list_topic_regulation_references',
  'create_topic_with_regulation_bundle','get_topic_requirements_status','assert_topic_requirements_ready',
  'fulfill_topic_requirement','get_topic_meeting_history','review_topic'))
or (n.nspname='qarar_meetings' and p.proname='search_eligible_agenda_topics')
or (n.nspname='qarar_voting' and p.proname='enforce_topic_requirements_before_vote')
on conflict(function_name,identity_arguments) do update set function_oid=excluded.function_oid,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values
('v1','create_topic_with_regulation_bundle','qarar_topics','create_topic_with_regulation_bundle','p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_references jsonb, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid','topics','authenticated'),
('v1','list_topic_regulation_references','qarar_topics','list_topic_regulation_references','p_topic_id uuid','topics','authenticated'),
('v1','get_topic_requirements_status','qarar_topics','get_topic_requirements_status','p_topic_id uuid','topics','authenticated'),
('v1','fulfill_topic_requirement','qarar_topics','fulfill_topic_requirement','p_topic_id uuid, p_requirement_code text, p_note text','topics','authenticated'),
('v1','add_topic_attachment','qarar_topics','add_topic_attachment','p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text, p_requirement_code text','topics','authenticated'),
('v1','get_topic_meeting_history','qarar_topics','get_topic_meeting_history','p_topic_id uuid','topics','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
