-- Meeting governance mode and meeting-scoped direct agenda topics.
-- Impact: docs/engineering/impact/DIRECT_MEETING_TOPICS_20261029_AR.md
begin;

alter table qarar_meetings.meetings
  add column governance_mode text not null default 'governed';
alter table qarar_meetings.meetings
  add constraint meetings_governance_mode_check
  check (governance_mode in ('governed','custom'));

alter table qarar_topics.topics
  add column meeting_scope_id uuid;
alter table qarar_topics.topics
  add constraint topics_meeting_scope_tenant_fk
  foreign key(meeting_scope_id,organization_id)
  references qarar_meetings.meetings(id,organization_id) on delete restrict;
alter table qarar_topics.topics
  add constraint topics_meeting_scope_shape
  check (
    meeting_scope_id is null or (
      governance_source='custom'
      and category_id is null
      and topic_type_version_id is null
      and workflow_template_version_id is null
      and workflow_instance_id is null
      and current_workflow_step_id is null
      and policy_id is null
      and policy_version_id is null
      and policy_item_id is null
      and policy_scope_assignment_id is null
    )
  );
create index topics_meeting_scope_idx
  on qarar_topics.topics(organization_id,meeting_scope_id)
  where meeting_scope_id is not null;

create function qarar_topics.create_meeting_scoped_topic(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_governance_unit_id uuid,
  p_title_ar text,
  p_description text,
  p_priority text,
  p_actor_user_id uuid,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_existing qarar_topics.topics%rowtype;
  v_year integer:=extract(year from current_date)::integer;
  v_number bigint;
  v_topic_no text;
  v_topic_id uuid;
begin
  select * into v_existing
  from qarar_topics.topics
  where organization_id=p_organization_id
    and submitted_by_user_id=p_actor_user_id
    and client_request_id=p_client_request_id;
  if v_existing.id is not null then
    if v_existing.meeting_scope_id is distinct from p_meeting_id
      or v_existing.title_ar is distinct from btrim(p_title_ar)
      or coalesce(v_existing.description,'') is distinct from coalesce(nullif(btrim(p_description),''),'')
      or v_existing.priority is distinct from coalesce(p_priority,'medium') then
      raise exception using errcode='40001',message='سبق استخدام إيصال الإضافة ببيانات مختلفة.';
    end if;
    return jsonb_build_object('topic_id',v_existing.id,'topic_no',v_existing.topic_no,'idempotent_replay',true);
  end if;

  insert into qarar_topics.topic_number_counters(organization_id,calendar_year,last_value)
  values(p_organization_id,v_year,1)
  on conflict(organization_id,calendar_year) do update
    set last_value=qarar_topics.topic_number_counters.last_value+1,updated_at=now()
  returning last_value into v_number;
  v_topic_no:=format('TOP-%s-%s',v_year,lpad(v_number::text,6,'0'));

  insert into qarar_topics.topics(
    organization_id,topic_no,title_ar,description,current_unit_id,
    submitted_by_user_id,source_type,priority,status,submitted_at,
    client_request_id,governance_source,routing_status,meeting_scope_id
  ) values(
    p_organization_id,v_topic_no,btrim(p_title_ar),nullif(btrim(p_description),''),p_governance_unit_id,
    p_actor_user_id,'new',coalesce(p_priority,'medium'),'listed',now(),
    p_client_request_id,'custom','routing_ready',p_meeting_id
  ) returning id into v_topic_id;

  return jsonb_build_object('topic_id',v_topic_id,'topic_no',v_topic_no,'idempotent_replay',false);
end;
$$;
alter function qarar_topics.create_meeting_scoped_topic(uuid,uuid,uuid,text,text,text,uuid,uuid)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.create_meeting_scoped_topic(uuid,uuid,uuid,text,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_topics.create_meeting_scoped_topic(uuid,uuid,uuid,text,text,text,uuid,uuid)
  to qarar_meetings_executor;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'meetings','qarar_topics','create_meeting_scoped_topic',
  'p_organization_id uuid, p_meeting_id uuid, p_governance_unit_id uuid, p_title_ar text, p_description text, p_priority text, p_actor_user_id uuid, p_client_request_id uuid',
  'Create the private topic aggregate used by a direct meeting agenda item after the meeting module validates chair authority and meeting state'
) on conflict do nothing;

create function qarar_meetings.create_direct_agenda_topic(
  p_meeting_id uuid,
  p_title_ar text,
  p_description text default null,
  p_priority text default 'medium',
  p_client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_meeting qarar_meetings.meetings%rowtype;
  v_created jsonb;
  v_topic_id uuid;
  v_item_id uuid;
  v_order integer;
begin
  if p_client_request_id is null then
    raise exception using errcode='22023',message='إيصال الإضافة مطلوب.';
  end if;
  if char_length(btrim(coalesce(p_title_ar,''))) not between 5 and 300 then
    raise exception using errcode='22023',message='عنوان الموضوع يجب أن يكون بين 5 و300 حرف.';
  end if;
  if char_length(coalesce(p_description,''))>10000 then
    raise exception using errcode='22023',message='وصف الموضوع أطول من الحد المسموح.';
  end if;
  if coalesce(p_priority,'medium') not in ('low','medium','high','urgent') then
    raise exception using errcode='22023',message='أولوية الموضوع غير صالحة.';
  end if;

  select * into v_meeting
  from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=v_org
  for update;
  if v_meeting.id is null then
    raise exception using errcode='P0002',message='الاجتماع غير موجود.';
  end if;
  if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id,array['council_chair']) then
    raise exception using errcode='42501',message='إضافة موضوع مباشر متاحة لرئيس المجلس فقط.';
  end if;
  if v_meeting.status not in ('draft','scheduled') then
    raise exception using errcode='23514',message='لا يمكن إضافة موضوع بعد إغلاق تجهيز جدول الأعمال.';
  end if;
  if v_meeting.governance_mode<>'custom' then
    raise exception using errcode='23514',message='هذا الاجتماع محكوم ويقبل الموضوعات الواردة عبر مساراتها فقط.';
  end if;

  v_created:=qarar_topics.create_meeting_scoped_topic(
    v_org,v_meeting.id,v_meeting.governance_unit_id,p_title_ar,p_description,
    coalesce(p_priority,'medium'),v_actor,p_client_request_id
  );
  v_topic_id:=(v_created->>'topic_id')::uuid;

  select id into v_item_id from qarar_meetings.agenda_items
  where meeting_id=v_meeting.id and topic_id=v_topic_id and organization_id=v_org;
  if v_item_id is null then
    select coalesce(max(agenda_order),0)+1 into v_order
    from qarar_meetings.agenda_items where meeting_id=v_meeting.id;
    insert into qarar_meetings.agenda_items(
      organization_id,meeting_id,topic_id,agenda_order,agenda_status
    ) values(v_org,v_meeting.id,v_topic_id,v_order,'pending')
    returning id into v_item_id;
    update qarar_meetings.meetings set updated_at=clock_timestamp()
    where id=v_meeting.id and organization_id=v_org;
    perform qarar_audit.append_audit_log(v_org,'meetings.direct_topic.add','agenda_items',v_item_id,
      jsonb_build_object('meeting_id',v_meeting.id,'topic_id',v_topic_id,'topic_no',v_created->>'topic_no'));
  end if;

  return v_created||jsonb_build_object(
    'meeting_id',v_meeting.id,'agenda_item_id',v_item_id,
    'idempotent_replay',coalesce((v_created->>'idempotent_replay')::boolean,false) or v_item_id is not null
  );
end;
$$;
alter function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,uuid)
  owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,uuid)
  to qarar_api_executor;

create function api_v2.create_direct_agenda_topic_v2(
  p_meeting_id uuid,
  p_title_ar text,
  p_description text default null,
  p_priority text default 'medium',
  p_client_request_id uuid default null
) returns jsonb
language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.create_direct_agenda_topic($1,$2,$3,$4,$5)$$;
alter function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,uuid) owner to qarar_api_executor;
revoke all on function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,uuid) from public,anon,service_role;
grant execute on function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,uuid) to authenticated;
insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values(
  'v2','create_direct_agenda_topic_v2','qarar_meetings','create_direct_agenda_topic',
  'p_meeting_id uuid, p_title_ar text, p_description text, p_priority text, p_client_request_id uuid',
  'meetings','authenticated'
) on conflict do nothing;

create or replace function qarar_meetings.enforce_governed_agenda_topic()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_meetings
as $$
declare v_topic record;v_meeting record;v_step record;
begin
  select organization_id,governance_source,routing_status,workflow_instance_id,
    current_workflow_step_id,topic_type_version_id,meeting_scope_id
  into v_topic from qarar_topics.topics where id=new.topic_id;
  select organization_id,governance_unit_id,governance_mode into v_meeting
  from qarar_meetings.meetings where id=new.meeting_id;
  if v_topic.organization_id is distinct from new.organization_id
    or v_meeting.organization_id is distinct from new.organization_id then
    raise exception using errcode='23503',message='الموضوع أو الاجتماع خارج المؤسسة';
  end if;
  if v_topic.meeting_scope_id is not null then
    if v_topic.meeting_scope_id is distinct from new.meeting_id
      or v_topic.governance_source<>'custom' or v_meeting.governance_mode<>'custom' then
      raise exception using errcode='23514',message='الموضوع المباشر مخصص لاجتماعه غير المحكوم فقط.';
    end if;
    return new;
  end if;
  if v_meeting.governance_mode='custom' then
    raise exception using errcode='23514',message='الاجتماع غير المحكوم يقبل موضوعاته المباشرة فقط.';
  end if;
  if v_topic.governance_source='legacy' then return new;end if;
  if v_topic.routing_status<>'routing_ready' or v_topic.workflow_instance_id is null
    or v_topic.current_workflow_step_id is null then
    raise exception using errcode='55000',message='لا يمكن إضافة موضوع بلا مسار حوكمة جاهز';
  end if;
  select s.assigned_unit_id,(s.snapshot->>'responsibility') responsibility into v_step
  from qarar_governance.workflow_instance_steps s
  where s.id=v_topic.current_workflow_step_id and s.workflow_instance_id=v_topic.workflow_instance_id
    and s.status='active';
  if v_step.assigned_unit_id is distinct from v_meeting.governance_unit_id then
    raise exception using errcode='42501',message='الاجتماع ليس للمجلس المسؤول عن الخطوة الحالية';
  end if;
  if not (v_topic.topic_type_version_id is not null and v_step.responsibility='review')
    and v_step.responsibility not in('present','discuss','recommend','initial_approve','final_approve') then
    raise exception using errcode='55000',message='الخطوة الحالية لا تسمح بعرض الموضوع على الأجندة';
  end if;
  return new;
end;
$$;
alter function qarar_meetings.enforce_governed_agenda_topic() owner to qarar_meetings_executor;

create or replace function qarar_meetings.check_agenda_item_eligibility()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_topic qarar_topics.topics%rowtype;v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=new.meeting_id and organization_id=new.organization_id;
  if v_meeting.id is null then raise exception 'meeting not found in agenda organization'; end if;
  select * into v_topic from qarar_topics.topics
  where id=new.topic_id and organization_id=new.organization_id;
  if v_topic.id is null then raise exception 'topic not found in agenda organization'; end if;
  if v_topic.meeting_scope_id is not null then
    if v_topic.meeting_scope_id is distinct from new.meeting_id then
      raise exception using errcode='23514',message='الموضوع المباشر تابع لاجتماع آخر.';
    end if;
    return new;
  end if;
  if v_topic.status<>'approved' and not new.is_exception
    and not (v_topic.topic_type_version_id is not null and v_topic.status in('new','under_review') and v_topic.routing_status='routing_ready') then
    raise exception 'topic is not eligible for agenda without an exception';
  end if;
  if new.is_exception and (new.exception_reason is null or char_length(btrim(new.exception_reason)) not between 5 and 2000) then
    raise exception 'exception reason must contain between 5 and 2000 characters';
  end if;
  if new.is_exception and not qarar_iam.is_system_admin()
    and not qarar_iam.has_permission('agenda.exception',v_meeting.governance_unit_id) then
    raise exception 'permission denied: agenda.exception' using errcode='42501';
  end if;
  if v_topic.topic_type_version_id is not null then
    perform qarar_topics.assert_topic_requirements_ready(v_topic.id,'before_review');
  end if;
  return new;
end;
$$;
alter function qarar_meetings.check_agenda_item_eligibility() owner to qarar_meetings_executor;

create or replace function qarar_voting.enforce_governed_voting_round()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_voting
as $$
declare v_topic record;v_meeting_unit uuid;v_step record;v_plan jsonb;
begin
  select t.governance_source,t.routing_status,t.workflow_instance_id,
    t.current_workflow_step_id,t.meeting_scope_id
  into v_topic from qarar_meetings.agenda_items a
  join qarar_topics.topics t on t.id=a.topic_id
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;
  if v_topic.meeting_scope_id is not null then
    if v_topic.meeting_scope_id is distinct from new.meeting_id then
      raise exception using errcode='23514',message='موضوع التصويت لا يتبع هذا الاجتماع.';
    end if;
    new.workflow_instance_step_id:=null;
    return new;
  end if;
  if v_topic.governance_source='legacy' then new.workflow_instance_step_id:=null;return new;end if;
  if v_topic.routing_status<>'routing_ready' or v_topic.workflow_instance_id is null
    or v_topic.current_workflow_step_id is null then
    raise exception using errcode='55000',message='لا يمكن فتح التصويت بلا مسار حوكمة جاهز';
  end if;
  select governance_unit_id into v_meeting_unit from qarar_meetings.meetings
  where id=new.meeting_id and organization_id=new.organization_id;
  select s.id,s.assigned_unit_id,s.status,s.workflow_instance_id,ts.step_type,ts.responsibility
  into v_step from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id and s.organization_id=new.organization_id;
  if v_step.id is null or v_step.status<>'active'
    or v_step.workflow_instance_id is distinct from v_topic.workflow_instance_id then
    raise exception using errcode='55000',message='خطوة الحوكمة الحالية غير نشطة أو لا تتبع المسار';
  end if;
  if v_step.assigned_unit_id is distinct from v_meeting_unit then
    raise exception using errcode='42501',message='التصويت ليس في المجلس المسؤول عن الخطوة الحالية';
  end if;
  v_plan:=qarar_governance.meeting_vote_plan(v_step.id);
  if v_plan->>'mode' is null then raise exception using errcode='55000',message=v_plan->>'reason';end if;
  if v_plan->>'mode'='voting_step' and v_step.responsibility not in('discuss','recommend','initial_approve','final_approve') then
    raise exception using errcode='55000',message='مسؤولية الخطوة الحالية لا تسمح بالتصويت';
  end if;
  new.workflow_instance_step_id:=v_step.id;
  return new;
end;
$$;
alter function qarar_voting.enforce_governed_voting_round() owner to qarar_voting_executor;

create or replace function qarar_governance.get_topic_agenda_context(p_topic_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'workflow_step_type',current_ts.step_type,
    'workflow_responsibility',current_ts.responsibility,
    'workflow_step_name_ar',case when t.meeting_scope_id is not null then 'موضوع مباشر' else current_ts.name_ar end,
    'requires_voting',true,
    'voting_available_now',plan.value->>'mode' is not null,
    'voting_unavailable_reason',plan.value->>'reason'
  )
  from qarar_topics.topics t
  left join qarar_governance.workflow_instance_steps current_step
    on current_step.id=t.current_workflow_step_id and current_step.workflow_instance_id=t.workflow_instance_id
  left join qarar_governance.workflow_template_steps current_ts on current_ts.id=current_step.template_step_id
  cross join lateral(select case
    when t.meeting_scope_id is not null then jsonb_build_object('mode','direct','reason',null)
    when t.governance_source='legacy' then jsonb_build_object('mode','legacy','reason',null)
    when t.routing_status<>'routing_ready' or t.workflow_instance_id is null then
      jsonb_build_object('mode',null,'reason','مسار حوكمة الموضوع غير جاهز، فلا يُفتح التصويت.')
    else qarar_governance.meeting_vote_plan(current_step.id) end as value) plan
  where t.id=p_topic_id and t.organization_id=qarar_iam.current_organization_id()
$$;
alter function qarar_governance.get_topic_agenda_context(uuid) owner to qarar_governance_executor;

alter function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)
  rename to search_eligible_agenda_topics_governed_core;
create function qarar_meetings.search_eligible_agenda_topics(
  p_meeting_id uuid,p_query text default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_meeting.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  perform qarar_iam.assert_permission('agenda.manage',v_meeting.governance_unit_id);
  if v_meeting.governance_mode='custom' then
    return jsonb_build_object('items','[]'::jsonb,'total',0,'locked',v_meeting.status not in('draft','scheduled'),
      'limit',least(greatest(coalesce(p_limit,25),1),100),'offset',greatest(coalesce(p_offset,0),0));
  end if;
  return qarar_meetings.search_eligible_agenda_topics_governed_core(p_meeting_id,p_query,p_limit,p_offset);
end;
$$;
alter function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) to qarar_api_executor;

alter function qarar_meetings.get_meeting_detail(uuid)
  rename to get_meeting_detail_before_direct_topics;
create function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_detail jsonb;v_can_direct boolean;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'governance_mode','governed')='custom'
    and coalesce((v_detail#>>'{capabilities,can_manage_agenda}')::boolean,false)
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  return jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
end;
$$;
alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;

create or replace function qarar_meetings.save_meeting_with_quorum(
  p_action text,p_values jsonb,p_quorum_percentage integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare result jsonb;entry jsonb;m qarar_meetings.meetings%rowtype;
  percentage integer:=coalesce(p_quorum_percentage,51);ids uuid[];meeting_id uuid;
  v_mode text:=coalesce(nullif(p_values->>'p_governance_mode',''),'governed');
begin
  if jsonb_typeof(p_values) is distinct from 'object' or p_action is null or p_action not in('create','series','update') then
    raise exception using errcode='22023',message='بيانات حفظ الاجتماع غير صالحة.';
  end if;
  if percentage not between 1 and 100 then raise exception using errcode='22023',message='نسبة النصاب يجب أن تكون عددًا صحيحًا بين 1 و100.';end if;
  if v_mode not in('governed','custom') then raise exception using errcode='22023',message='نوع حوكمة الاجتماع غير صالح.';end if;
  if p_action='update' then
    select * into m from qarar_meetings.meetings where id=(p_values->>'p_meeting_id')::uuid
      and organization_id=qarar_iam.current_organization_id() for update;
    if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
    perform qarar_iam.assert_permission('meetings.manage',m.governance_unit_id);
    if m.status not in('draft','scheduled') or m.attendance_locked_at is not null then
      raise exception using errcode='23514',message='لا يمكن تعديل النصاب بعد بدء الجلسة أو تثبيت الحضور.';
    end if;
    if (p_values ? 'p_governance_mode') and v_mode<>m.governance_mode then
      raise exception using errcode='23514',message='لا يمكن تغيير نوع الاجتماع بعد إنشائه.';
    end if;
    v_mode:=m.governance_mode;
    result:=qarar_meetings.update_meeting(m.id,p_values->>'p_title_ar',(p_values->>'p_scheduled_date')::date,
      nullif(p_values->>'p_start_time','')::time,nullif(p_values->>'p_end_time','')::time,
      coalesce(p_values->>'p_location_type','onsite'),p_values->>'p_location_details',p_values->>'p_title_en',
      (p_values->>'p_meeting_type_id')::uuid,(p_values->>'p_expected_updated_at')::timestamptz);
    ids:=array[m.id];
  elsif p_action='create' then
    result:=qarar_meetings.create_meeting((p_values->>'p_governance_unit_id')::uuid,(p_values->>'p_meeting_type_id')::uuid,
      p_values->>'p_title_ar',(p_values->>'p_scheduled_date')::date,nullif(p_values->>'p_start_time','')::time,
      nullif(p_values->>'p_end_time','')::time,coalesce(p_values->>'p_location_type','onsite'),
      p_values->>'p_location_details',p_values->>'p_title_en',(p_values->>'p_client_request_id')::uuid);
    if coalesce((result->>'idempotent_replay')::boolean,false) then
      select * into m from qarar_meetings.meetings where id=(result->>'id')::uuid and organization_id=qarar_iam.current_organization_id();
      if m.quorum_percentage<>percentage or m.governance_mode<>v_mode then
        raise exception using errcode='40001',message='سبق حفظ هذا الاجتماع بإعدادات مختلفة؛ افتحه للتعديل.';
      end if;
      return result||jsonb_build_object('quorum_percentage',percentage,'governance_mode',v_mode);
    end if;
    ids:=array[(result->>'id')::uuid];
  else
    result:=qarar_meetings.create_meeting_series((p_values->>'p_governance_unit_id')::uuid,(p_values->>'p_meeting_type_id')::uuid,
      p_values->>'p_title_ar',(p_values->>'p_first_date')::date,nullif(p_values->>'p_start_time','')::time,
      nullif(p_values->>'p_end_time','')::time,coalesce(p_values->>'p_location_type','onsite'),p_values->>'p_location_details',
      p_values->>'p_frequency',(p_values->>'p_interval_count')::integer,(p_values->>'p_occurrence_count')::integer);
    for entry in select value from jsonb_array_elements(result->'occurrences') loop ids:=array_append(ids,(entry->>'id')::uuid);end loop;
  end if;
  foreach meeting_id in array ids loop
    select * into m from qarar_meetings.meetings where id=meeting_id and organization_id=qarar_iam.current_organization_id() for update;
    update qarar_meetings.meetings set quorum_percentage=percentage,governance_mode=v_mode where id=m.id and organization_id=m.organization_id;
    perform qarar_audit.append_audit_log(m.organization_id,'meetings.configuration.set','meetings',m.id,
      jsonb_build_object('previous_quorum_percentage',m.quorum_percentage,'quorum_percentage',percentage,
        'previous_governance_mode',m.governance_mode,'governance_mode',v_mode));
    perform qarar_audit.append_audit_log(m.organization_id,'meetings.quorum.set','meetings',m.id,
      jsonb_build_object('previous_percentage',m.quorum_percentage,'quorum_percentage',percentage));
  end loop;
  if p_action='update' then return qarar_meetings.get_meeting_detail(m.id);end if;
  return result||jsonb_build_object('quorum_percentage',percentage,'governance_mode',v_mode);
end;
$$;
alter function qarar_meetings.save_meeting_with_quorum(text,jsonb,integer) owner to qarar_meetings_executor;

update qarar_architecture.api_release_registry r set
  contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v2'),
  contract_hash=(select md5(string_agg(
    p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,
    E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v2'
    join qarar_architecture.api_contract_registry c on c.api_version='v2'
      and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v2';

notify pgrst,'reload schema';
commit;
