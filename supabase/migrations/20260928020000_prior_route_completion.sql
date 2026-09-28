begin;

-- A prior-route request proves that a contiguous prefix of the regulated
-- workflow was completed before the topic entered Qarar. It never changes the
-- selected regulation or template and remains blocked until independent review.
create table qarar_governance.topic_prior_route_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  workflow_instance_id uuid not null,
  status text not null default 'draft',
  requested_by_user_id uuid not null,
  submitted_at timestamptz,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id, organization_id),
  unique(topic_id),
  foreign key(topic_id, organization_id)
    references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key(workflow_instance_id, organization_id)
    references qarar_governance.workflow_instances(id, organization_id) on delete restrict,
  foreign key(requested_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key(reviewed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check(status in ('draft','submitted','approved','rejected','cancelled')),
  check(reviewed_by_user_id is null or reviewed_by_user_id <> requested_by_user_id),
  check((status in ('draft','submitted','cancelled') and reviewed_by_user_id is null and reviewed_at is null)
    or (status in ('approved','rejected') and reviewed_by_user_id is not null and reviewed_at is not null))
);

create table qarar_governance.topic_prior_route_step_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  workflow_instance_step_id uuid not null,
  template_step_id uuid not null,
  sequence_no integer not null,
  meeting_date date not null,
  meeting_reference text,
  decision_type text not null,
  decision_text text not null,
  bypass_reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id, organization_id),
  unique(request_id, sequence_no),
  unique(request_id, template_step_id),
  foreign key(request_id, organization_id)
    references qarar_governance.topic_prior_route_requests(id, organization_id) on delete restrict,
  foreign key(workflow_instance_step_id, organization_id)
    references qarar_governance.workflow_instance_steps(id, organization_id) on delete restrict,
  foreign key(template_step_id, organization_id)
    references qarar_governance.workflow_template_steps(id, organization_id) on delete restrict,
  check(sequence_no > 0),
  check(decision_type in ('approved','recommended','referred','completed')),
  check(char_length(btrim(decision_text)) between 3 and 4000),
  check(char_length(btrim(bypass_reason)) between 10 and 2000),
  check(meeting_reference is null or char_length(btrim(meeting_reference)) <= 200)
);

create table qarar_governance.topic_prior_route_evidence_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  step_evidence_id uuid not null,
  topic_attachment_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id, organization_id),
  unique(step_evidence_id, topic_attachment_id),
  foreign key(step_evidence_id, organization_id)
    references qarar_governance.topic_prior_route_step_evidence(id, organization_id) on delete restrict,
  foreign key(topic_attachment_id, organization_id)
    references qarar_topics.topic_attachments(id, organization_id) on delete restrict
);

create index topic_prior_route_review_idx
  on qarar_governance.topic_prior_route_requests(organization_id, status, coalesce(submitted_at, created_at) desc);

alter table qarar_governance.topic_prior_route_requests enable row level security;
alter table qarar_governance.topic_prior_route_requests force row level security;
alter table qarar_governance.topic_prior_route_step_evidence enable row level security;
alter table qarar_governance.topic_prior_route_step_evidence force row level security;
alter table qarar_governance.topic_prior_route_evidence_attachments enable row level security;
alter table qarar_governance.topic_prior_route_evidence_attachments force row level security;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
  ('topic_prior_route_requests','governance',false),
  ('topic_prior_route_step_evidence','governance',false),
  ('topic_prior_route_evidence_attachments','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,name_ar,name_en,description,is_system_permission,is_active
)
select o.id,p.code,'governance',p.action,p.context_scope,p.name_ar,p.name_en,p.description,true,true
from qarar_core.organizations o
cross join (values
  ('governance.prior_route.request','request','governance_unit','طلب استكمال مسار سابق','Request prior route completion','Document workflow stages completed before the topic entered Qarar'),
  ('governance.prior_route.approve','approve','organization','اعتماد استكمال المسار السابق','Approve prior route completion','Independently verify prior meetings and activate the remaining route')
) p(code,action,context_scope,name_ar,name_en,description)
on conflict(organization_id,code) do nothing;

-- Preserve existing authorization intent: roles allowed to request/review
-- exceptions receive the corresponding prior-route permission.
insert into qarar_iam.role_permissions(
  organization_id,role_id,permission_id,granted_by_user_id,granted_at,is_active
)
select rp.organization_id,rp.role_id,new_permission.id,rp.granted_by_user_id,clock_timestamp(),rp.is_active
from qarar_iam.role_permissions rp
join qarar_iam.permissions old_permission on old_permission.id=rp.permission_id
join qarar_iam.permissions new_permission on new_permission.organization_id=rp.organization_id
  and new_permission.code=case old_permission.code
    when 'governance.exceptions.request' then 'governance.prior_route.request'
    when 'governance.exceptions.approve' then 'governance.prior_route.approve' end
where old_permission.code in ('governance.exceptions.request','governance.exceptions.approve')
  and not exists(select 1 from qarar_iam.role_permissions existing
    where existing.organization_id=rp.organization_id and existing.role_id=rp.role_id
      and existing.permission_id=new_permission.id);

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'governance','qarar_topics','create_topic_with_selected_regulation',
  'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid',
  'Create the regulated topic atomically before holding its workflow for verified prior-stage evidence'
) on conflict do nothing;

grant execute on function qarar_topics.create_topic_with_selected_regulation(
  text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid
) to qarar_governance_executor;
grant select,insert,update on qarar_governance.topic_prior_route_requests,
  qarar_governance.topic_prior_route_step_evidence,
  qarar_governance.topic_prior_route_evidence_attachments to qarar_governance_executor;
grant select on qarar_topics.topic_attachments to qarar_governance_executor;

create or replace function qarar_governance.get_topic_prior_route_candidate_steps(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text,
  p_source_type text,
  p_effective_on date,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_option record;v_steps jsonb;
begin
  perform qarar_iam.assert_permission('topics.create',p_governance_unit_id);
  perform qarar_iam.assert_permission('governance.prior_route.request',p_governance_unit_id);
  select * into v_option from qarar_governance.eligible_topic_regulation_options(
    p_governance_unit_id,p_topic_category_id,p_priority,p_source_type,p_effective_on
  ) where policy_id=p_policy_id and policy_version_id=p_policy_version_id
    and policy_item_id=p_policy_item_id and scope_assignment_id=p_scope_assignment_id;
  if v_option.policy_id is null or v_option.routing_outcome<>'resolved'
    or v_option.workflow_template_version_id is null then
    raise exception using errcode='23514',message='المسار اللائحي المختار غير جاهز لاستكمال مسار سابق';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'template_step_id',s.id,'sequence_no',s.sequence_no,'title',s.name_ar,
    'step_type',s.step_type,'responsibility',s.responsibility,
    'responsible_unit_id',qarar_governance.resolve_step_unit(v_org,p_governance_unit_id,s.governance_unit_id,s.governance_class_id),
    'responsible_entity',coalesce(u.name_ar,c.name_ar,'الجهة المحددة في المسار'),
    'is_terminal',s.is_terminal
  ) order by s.sequence_no),'[]'::jsonb) into v_steps
  from qarar_governance.workflow_template_steps s
  left join qarar_core.governance_units u on u.id=s.governance_unit_id and u.organization_id=s.organization_id
  left join qarar_governance.governance_unit_classes c on c.id=s.governance_class_id and c.organization_id=s.organization_id
  where s.organization_id=v_org and s.workflow_template_version_id=v_option.workflow_template_version_id;
  return jsonb_build_object('workflow_template_version_id',v_option.workflow_template_version_id,'steps',v_steps);
end $$;

create or replace function qarar_governance.create_topic_prior_route_request(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_scope_assignment_id uuid,
  p_evidence jsonb,p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb
language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_created jsonb;
  v_topic_id uuid;v_instance_id uuid;v_request_id uuid;v_total integer;v_selected integer;
begin
  if v_org is null or v_actor is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
  perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
  perform qarar_iam.assert_permission('governance.prior_route.request',p_current_unit_id);
  if jsonb_typeof(p_evidence)<>'array' then raise exception using errcode='22023',message='بيانات المراحل السابقة غير صالحة';end if;
  v_selected:=jsonb_array_length(p_evidence);
  select count(*) into v_total from qarar_governance.eligible_topic_regulation_options(
    p_current_unit_id,p_category_id,p_priority,p_source_type,current_date
  ) option_row join qarar_governance.workflow_template_steps step_row
    on step_row.workflow_template_version_id=option_row.workflow_template_version_id
  where option_row.policy_id=p_policy_id and option_row.policy_version_id=p_policy_version_id
    and option_row.policy_item_id=p_policy_item_id and option_row.scope_assignment_id=p_scope_assignment_id
    and option_row.routing_outcome='resolved';
  if v_selected<1 or v_selected>=v_total then
    raise exception using errcode='22023',message='اختر مرحلة سابقة واحدة على الأقل واترك مرحلة متبقية للنظام';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_evidence) with ordinality evidence(value,position)
    left join qarar_governance.workflow_template_steps step_row
      on step_row.id=nullif(evidence.value->>'template_step_id','')::uuid
      and step_row.sequence_no=evidence.position
    where step_row.id is null
      or coalesce(evidence.value->>'meeting_date','')!~'^\d{4}-\d{2}-\d{2}$'
      or (evidence.value->>'meeting_date')::date>current_date
      or coalesce(evidence.value->>'decision_type','') not in ('approved','recommended','referred','completed')
      or char_length(btrim(coalesce(evidence.value->>'decision_text','')))<3
      or char_length(btrim(coalesce(evidence.value->>'bypass_reason','')))<10
  ) then raise exception using errcode='22023',message='أكمل تاريخ وقرار وسبب كل مرحلة سابقة بالترتيب';end if;

  v_created:=qarar_topics.create_topic_with_selected_regulation(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,p_priority,p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=coalesce(v_created->>'topic_id',v_created->>'id')::uuid;
  select id into v_request_id from qarar_governance.topic_prior_route_requests
    where topic_id=v_topic_id and organization_id=v_org;
  if v_request_id is not null then
    return jsonb_build_object('topic_id',v_topic_id,'request_id',v_request_id,'status',
      (select status from qarar_governance.topic_prior_route_requests where id=v_request_id),
      'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'template_step_id',e.template_step_id,'sequence_no',e.sequence_no) order by e.sequence_no),'[]'::jsonb)
        from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request_id));
  end if;
  select id into v_instance_id from qarar_governance.workflow_instances
    where topic_id=v_topic_id and organization_id=v_org for update;
  if v_instance_id is null then raise exception using errcode='55000',message='تعذر إنشاء المسار اللائحي للموضوع';end if;
  update qarar_governance.workflow_instance_steps set status='pending',opened_at=null
    where workflow_instance_id=v_instance_id and organization_id=v_org;
  update qarar_governance.workflow_instances set status='blocked',current_step_id=null,updated_at=clock_timestamp()
    where id=v_instance_id and organization_id=v_org;
  insert into qarar_governance.topic_prior_route_requests(
    organization_id,topic_id,workflow_instance_id,status,requested_by_user_id
  ) values(v_org,v_topic_id,v_instance_id,'draft',v_actor) returning id into v_request_id;
  insert into qarar_governance.topic_prior_route_step_evidence(
    organization_id,request_id,workflow_instance_step_id,template_step_id,sequence_no,
    meeting_date,meeting_reference,decision_type,decision_text,bypass_reason
  )
  select v_org,v_request_id,instance_step.id,template_step.id,template_step.sequence_no,
    (evidence.value->>'meeting_date')::date,nullif(btrim(coalesce(evidence.value->>'meeting_reference','')),''),
    evidence.value->>'decision_type',btrim(evidence.value->>'decision_text'),btrim(evidence.value->>'bypass_reason')
  from jsonb_array_elements(p_evidence) with ordinality evidence(value,position)
  join qarar_governance.workflow_template_steps template_step
    on template_step.id=(evidence.value->>'template_step_id')::uuid and template_step.sequence_no=evidence.position
  join qarar_governance.workflow_instance_steps instance_step
    on instance_step.workflow_instance_id=v_instance_id and instance_step.template_step_id=template_step.id;
  update qarar_governance.topic_governance_mappings set routing_status='routing_pending',
    snapshot=snapshot||jsonb_build_object('prior_route_request_id',v_request_id,'prior_route_status','draft')
    where topic_id=v_topic_id and organization_id=v_org;
  perform qarar_topics.apply_governance_snapshot(v_topic_id,'regulated','routing_pending',p_policy_id,p_policy_version_id,
    p_policy_item_id,p_scope_assignment_id,(select workflow_template_version_id from qarar_governance.workflow_instances where id=v_instance_id),
    v_instance_id,null,(select routing_decision_id from qarar_topics.topics where id=v_topic_id));
  perform qarar_audit.append_audit_log(v_org,'governance.prior_route.draft','topic_prior_route_requests',v_request_id,
    jsonb_build_object('topic_id',v_topic_id,'evidence_steps',v_selected));
  return jsonb_build_object('topic_id',v_topic_id,'request_id',v_request_id,'status','draft',
    'evidence',(select jsonb_agg(jsonb_build_object('id',e.id,'template_step_id',e.template_step_id,'sequence_no',e.sequence_no) order by e.sequence_no)
      from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request_id));
end $$;

create or replace function qarar_governance.add_prior_route_evidence_attachment(
  p_step_evidence_id uuid,p_topic_attachment_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_request record;v_id uuid;
begin
  select r.*,t.current_unit_id into v_request from qarar_governance.topic_prior_route_step_evidence e
  join qarar_governance.topic_prior_route_requests r on r.id=e.request_id and r.organization_id=e.organization_id
  join qarar_topics.topics t on t.id=r.topic_id and t.organization_id=r.organization_id
  where e.id=p_step_evidence_id and e.organization_id=v_org for update of r;
  if v_request.id is null then raise exception using errcode='P0002',message='مرحلة الإثبات غير موجودة';end if;
  perform qarar_iam.assert_permission('governance.prior_route.request',v_request.current_unit_id);
  if v_request.status<>'draft' then raise exception using errcode='55000',message='لا يمكن تعديل الأدلة بعد الإرسال';end if;
  if not exists(select 1 from qarar_topics.topic_attachments a where a.id=p_topic_attachment_id
    and a.topic_id=v_request.topic_id and a.organization_id=v_org) then
    raise exception using errcode='23514',message='المرفق لا يتبع هذا الموضوع';end if;
  insert into qarar_governance.topic_prior_route_evidence_attachments(organization_id,step_evidence_id,topic_attachment_id)
  values(v_org,p_step_evidence_id,p_topic_attachment_id) returning id into v_id;
  return jsonb_build_object('id',v_id,'step_evidence_id',p_step_evidence_id,'attachment_id',p_topic_attachment_id);
end $$;

create or replace function qarar_governance.submit_topic_prior_route_request(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_request record;
begin
  select r.*,t.current_unit_id into v_request from qarar_governance.topic_prior_route_requests r
  join qarar_topics.topics t on t.id=r.topic_id and t.organization_id=r.organization_id
  where r.id=p_request_id and r.organization_id=v_org for update;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب استكمال المسار غير موجود';end if;
  perform qarar_iam.assert_permission('governance.prior_route.request',v_request.current_unit_id);
  if v_request.requested_by_user_id<>auth.uid() then raise exception using errcode='42501',message='لا يمكن إرسال طلب أنشأه مستخدم آخر';end if;
  if v_request.status='submitted' then return jsonb_build_object('request_id',v_request.id,'topic_id',v_request.topic_id,'status','submitted','idempotent_replay',true);end if;
  if v_request.status<>'draft' then raise exception using errcode='55000',message='الطلب ليس في حالة مسودة';end if;
  if exists(select 1 from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request.id
    and not exists(select 1 from qarar_governance.topic_prior_route_evidence_attachments a where a.step_evidence_id=e.id)) then
    raise exception using errcode='23514',message='يجب رفع محضر أو دليل واحد على الأقل لكل مجلس سابق';end if;
  update qarar_governance.topic_prior_route_requests set status='submitted',submitted_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_request.id;
  update qarar_governance.topic_governance_mappings set snapshot=snapshot||jsonb_build_object('prior_route_status','submitted')
    where topic_id=v_request.topic_id and organization_id=v_org;
  perform qarar_audit.append_audit_log(v_org,'governance.prior_route.submit','topic_prior_route_requests',v_request.id,
    jsonb_build_object('topic_id',v_request.topic_id));
  return jsonb_build_object('request_id',v_request.id,'topic_id',v_request.topic_id,'status','submitted');
end $$;

create or replace function qarar_governance.admin_list_topic_prior_route_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.prior_route.approve',null);
  return jsonb_build_object('items',coalesce((select jsonb_agg(item order by item->>'submitted_at' desc) from (
    select jsonb_build_object('id',r.id,'topic_id',r.topic_id,'topic_no',t.topic_no,'topic_title_ar',t.title_ar,
      'status',r.status,'requested_by_user_id',r.requested_by_user_id,'submitted_at',r.submitted_at,
      'requester_name_ar',u.name_ar,'steps',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'sequence_no',e.sequence_no,'step_title',s.snapshot->>'name_ar','responsible_unit_name_ar',gu.name_ar,
        'meeting_date',e.meeting_date,'meeting_reference',e.meeting_reference,'decision_type',e.decision_type,
        'decision_text',e.decision_text,'bypass_reason',e.bypass_reason,'attachments',coalesce((select jsonb_agg(jsonb_build_object(
          'id',ta.id,'file_name',ta.file_name,'file_url',ta.file_url,'mime_type',ta.mime_type))
          from qarar_governance.topic_prior_route_evidence_attachments link
          join qarar_topics.topic_attachments ta on ta.id=link.topic_attachment_id and ta.organization_id=link.organization_id
          where link.step_evidence_id=e.id),'[]'::jsonb)) order by e.sequence_no)
        from qarar_governance.topic_prior_route_step_evidence e
        join qarar_governance.workflow_instance_steps s on s.id=e.workflow_instance_step_id
        left join qarar_core.governance_units gu on gu.id=s.assigned_unit_id
        where e.request_id=r.id),'[]'::jsonb)) item
    from qarar_governance.topic_prior_route_requests r
    join qarar_topics.topics t on t.id=r.topic_id and t.organization_id=r.organization_id
    join qarar_iam.users u on u.id=r.requested_by_user_id and u.organization_id=r.organization_id
    where r.organization_id=v_org and (p_status is null or r.status=p_status)
  ) rows),'[]'::jsonb));
end $$;

create or replace function qarar_governance.review_topic_prior_route_request(
  p_request_id uuid,p_action text,p_comment text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_request record;v_next uuid;v_next_sequence integer;
begin
  perform qarar_iam.assert_permission('governance.prior_route.approve',null);
  if p_action not in ('approve','reject') then raise exception using errcode='22023',message='الإجراء غير صالح';end if;
  if char_length(btrim(coalesce(p_comment,'')))<5 then raise exception using errcode='22023',message='اكتب ملاحظة المراجعة';end if;
  select * into v_request from qarar_governance.topic_prior_route_requests
    where id=p_request_id and organization_id=v_org for update;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب استكمال المسار غير موجود';end if;
  if v_request.status<>'submitted' then raise exception using errcode='55000',message='الطلب ليس بانتظار المراجعة';end if;
  if v_request.requested_by_user_id=v_actor then raise exception using errcode='42501',message='لا يجوز لمقدم الطلب اعتماد أدلته بنفسه';end if;
  if p_action='reject' then
    update qarar_governance.topic_prior_route_requests set status='rejected',reviewed_by_user_id=v_actor,
      reviewed_at=clock_timestamp(),review_comment=btrim(p_comment),updated_at=clock_timestamp() where id=v_request.id;
    update qarar_governance.topic_governance_mappings set routing_status='routing_blocked',
      snapshot=snapshot||jsonb_build_object('prior_route_status','rejected') where topic_id=v_request.topic_id and organization_id=v_org;
    update qarar_topics.topics set routing_status='routing_blocked',updated_at=clock_timestamp() where id=v_request.topic_id and organization_id=v_org;
  else
    select max(sequence_no)+1 into v_next_sequence from qarar_governance.topic_prior_route_step_evidence where request_id=v_request.id;
    if exists(select 1 from qarar_governance.topic_prior_route_step_evidence e where e.request_id=v_request.id
      and not exists(select 1 from qarar_governance.topic_prior_route_evidence_attachments a where a.step_evidence_id=e.id)) then
      raise exception using errcode='23514',message='يوجد مجلس سابق بلا محضر أو دليل';end if;
    update qarar_governance.workflow_instance_steps step_instance set status='completed',acted_by_user_id=v_actor,
      acted_at=clock_timestamp(),outcome_code=case when 'approved'=any(template_step.allowed_outcomes) then 'approved' else 'completed' end,
      comment='مرحلة منفذة خارج النظام ومعتمدة: '||btrim(p_comment),
      snapshot=step_instance.snapshot||jsonb_build_object('completion_source','prior_external_meeting','prior_route_request_id',v_request.id,
        'evidence_id',evidence.id,'meeting_date',evidence.meeting_date,'decision_type',evidence.decision_type)
    from qarar_governance.topic_prior_route_step_evidence evidence
    join qarar_governance.workflow_template_steps template_step on template_step.id=evidence.template_step_id
    where evidence.request_id=v_request.id and step_instance.id=evidence.workflow_instance_step_id;
    select id into v_next from qarar_governance.workflow_instance_steps where workflow_instance_id=v_request.workflow_instance_id
      and sequence_no=v_next_sequence for update;
    if v_next is null then raise exception using errcode='23514',message='لا توجد مرحلة متبقية يمكن تفعيلها';end if;
    update qarar_governance.workflow_instance_steps set status='active',opened_at=clock_timestamp() where id=v_next;
    update qarar_governance.workflow_instances set status='active',current_step_id=v_next,updated_at=clock_timestamp()
      where id=v_request.workflow_instance_id;
    update qarar_governance.topic_prior_route_requests set status='approved',reviewed_by_user_id=v_actor,
      reviewed_at=clock_timestamp(),review_comment=btrim(p_comment),updated_at=clock_timestamp() where id=v_request.id;
    update qarar_governance.topic_governance_mappings set routing_status='routing_ready',
      snapshot=snapshot||jsonb_build_object('prior_route_status','approved','prior_route_approved_at',clock_timestamp())
      where topic_id=v_request.topic_id and organization_id=v_org;
    update qarar_topics.topics set routing_status='routing_ready',current_workflow_step_id=v_next,updated_at=clock_timestamp()
      where id=v_request.topic_id and organization_id=v_org;
  end if;
  perform qarar_audit.append_audit_log(v_org,'governance.prior_route.'||p_action,'topic_prior_route_requests',v_request.id,
    jsonb_build_object('topic_id',v_request.topic_id,'comment',btrim(p_comment),'next_step_id',v_next));
  return jsonb_build_object('request_id',v_request.id,'topic_id',v_request.topic_id,
    'status',case when p_action='approve' then 'approved' else 'rejected' end,'current_workflow_step_id',v_next);
end $$;

alter function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_governance_executor;
alter function qarar_governance.add_prior_route_evidence_attachment(uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.submit_topic_prior_route_request(uuid) owner to qarar_governance_executor;
alter function qarar_governance.admin_list_topic_prior_route_requests(text) owner to qarar_governance_executor;
alter function qarar_governance.review_topic_prior_route_request(uuid,text,text) owner to qarar_governance_executor;

revoke all on function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  qarar_governance.add_prior_route_evidence_attachment(uuid,uuid),
  qarar_governance.submit_topic_prior_route_request(uuid),
  qarar_governance.admin_list_topic_prior_route_requests(text),
  qarar_governance.review_topic_prior_route_request(uuid,text,text)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  qarar_governance.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  qarar_governance.add_prior_route_evidence_attachment(uuid,uuid),
  qarar_governance.submit_topic_prior_route_request(uuid),
  qarar_governance.admin_list_topic_prior_route_requests(text),
  qarar_governance.review_topic_prior_route_request(uuid,text,text)
to qarar_api_executor;

create or replace function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.get_topic_prior_route_candidate_steps($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
create or replace function api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text default 'medium',text default 'new',text default null,uuid default null) returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_governance.create_topic_prior_route_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)$$;
create or replace function api_v1.add_prior_route_evidence_attachment(uuid,uuid) returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_governance.add_prior_route_evidence_attachment($1,$2)$$;
create or replace function api_v1.submit_topic_prior_route_request(uuid) returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_governance.submit_topic_prior_route_request($1)$$;
create or replace function api_v1.admin_list_topic_prior_route_requests(text default null) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_list_topic_prior_route_requests($1)$$;
create or replace function api_v1.review_topic_prior_route_request(uuid,text,text) returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_governance.review_topic_prior_route_request($1,$2,$3)$$;

alter function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid) owner to qarar_api_executor;
alter function api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_api_executor;
alter function api_v1.add_prior_route_evidence_attachment(uuid,uuid) owner to qarar_api_executor;
alter function api_v1.submit_topic_prior_route_request(uuid) owner to qarar_api_executor;
alter function api_v1.admin_list_topic_prior_route_requests(text) owner to qarar_api_executor;
alter function api_v1.review_topic_prior_route_request(uuid,text,text) owner to qarar_api_executor;
grant execute on function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.add_prior_route_evidence_attachment(uuid,uuid),api_v1.submit_topic_prior_route_request(uuid),
  api_v1.admin_list_topic_prior_route_requests(text),api_v1.review_topic_prior_route_request(uuid,text,text)
to authenticated,service_role;
revoke execute on function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.add_prior_route_evidence_attachment(uuid,uuid),api_v1.submit_topic_prior_route_request(uuid),
  api_v1.admin_list_topic_prior_route_requests(text),api_v1.review_topic_prior_route_request(uuid,text,text)
from public,anon;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname in(
  'get_topic_prior_route_candidate_steps','create_topic_prior_route_request','add_prior_route_evidence_attachment',
  'submit_topic_prior_route_request','admin_list_topic_prior_route_requests','review_topic_prior_route_request')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values
('v1','get_topic_prior_route_candidate_steps','qarar_governance','get_topic_prior_route_candidate_steps','p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid','governance','authenticated'),
('v1','create_topic_prior_route_request','qarar_governance','create_topic_prior_route_request','p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_policy_id uuid, p_policy_version_id uuid, p_policy_item_id uuid, p_scope_assignment_id uuid, p_evidence jsonb, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid','governance','authenticated'),
('v1','add_prior_route_evidence_attachment','qarar_governance','add_prior_route_evidence_attachment','p_step_evidence_id uuid, p_topic_attachment_id uuid','governance','authenticated'),
('v1','submit_topic_prior_route_request','qarar_governance','submit_topic_prior_route_request','p_request_id uuid','governance','authenticated'),
('v1','admin_list_topic_prior_route_requests','qarar_governance','admin_list_topic_prior_route_requests','p_status text','governance','authenticated'),
('v1','review_topic_prior_route_request','qarar_governance','review_topic_prior_route_request','p_request_id uuid, p_action text, p_comment text','governance','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

commit;
