-- A direct topic may be discussion-only, and a governed meeting may contain direct topics.
begin;

alter table qarar_meetings.agenda_items
  add column requires_voting boolean not null default true;

create function qarar_meetings.guard_agenda_voting_policy()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_scope uuid;
begin
  select meeting_scope_id into v_scope from qarar_topics.topics
  where id=new.topic_id and organization_id=new.organization_id;
  if v_scope is null and not new.requires_voting then
    raise exception using errcode='23514',message='بنود المسارات المحكومة تتطلب تصويت المجلس.';
  end if;
  return new;
end;
$$;
alter function qarar_meetings.guard_agenda_voting_policy() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.guard_agenda_voting_policy() from public,anon,authenticated,service_role;
create trigger agenda_items_voting_policy_guard
before insert or update of topic_id,requires_voting on qarar_meetings.agenda_items
for each row execute function qarar_meetings.guard_agenda_voting_policy();

create or replace function qarar_meetings.enforce_governed_agenda_topic()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_meetings
as $$
declare v_topic record;v_meeting record;v_step record;
begin
  select organization_id,governance_source,routing_status,workflow_instance_id,current_workflow_step_id,
    topic_type_version_id,meeting_scope_id into v_topic
  from qarar_topics.topics where id=new.topic_id;
  select organization_id,governance_unit_id,governance_mode into v_meeting
  from qarar_meetings.meetings where id=new.meeting_id;
  if v_topic.organization_id is distinct from new.organization_id or v_meeting.organization_id is distinct from new.organization_id then
    raise exception using errcode='23503',message='الموضوع أو الاجتماع خارج المؤسسة';
  end if;
  if v_topic.meeting_scope_id is not null then
    if v_topic.meeting_scope_id is distinct from new.meeting_id or v_topic.governance_source<>'custom' then
      raise exception using errcode='23514',message='الموضوع المباشر مخصص لاجتماعه فقط.';
    end if;
    return new;
  end if;
  if v_meeting.governance_mode='custom' then
    raise exception using errcode='23514',message='الاجتماع غير المحكوم يقبل موضوعاته المباشرة فقط.';
  end if;
  if v_topic.governance_source='legacy' then return new;end if;
  if v_topic.routing_status<>'routing_ready' or v_topic.workflow_instance_id is null or v_topic.current_workflow_step_id is null then
    raise exception using errcode='55000',message='لا يمكن إضافة موضوع بلا مسار حوكمة جاهز';
  end if;
  select s.assigned_unit_id,(s.snapshot->>'responsibility') responsibility into v_step
  from qarar_governance.workflow_instance_steps s
  where s.id=v_topic.current_workflow_step_id and s.workflow_instance_id=v_topic.workflow_instance_id and s.status='active';
  if v_step.assigned_unit_id is distinct from v_meeting.governance_unit_id then
    raise exception using errcode='42501',message='الاجتماع ليس للمجلس المسؤول عن الخطوة الحالية';
  end if;
  if not(v_topic.topic_type_version_id is not null and v_step.responsibility='review')
    and v_step.responsibility not in('present','discuss','recommend','initial_approve','final_approve') then
    raise exception using errcode='55000',message='الخطوة الحالية لا تسمح بعرض الموضوع على الأجندة';
  end if;
  return new;
end;
$$;
alter function qarar_meetings.enforce_governed_agenda_topic() owner to qarar_meetings_executor;

drop function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,uuid);
drop function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,uuid);

create function qarar_meetings.create_direct_agenda_topic(
  p_meeting_id uuid,p_title_ar text,p_description text default null,p_priority text default 'medium',
  p_requires_voting boolean default false,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();
  v_meeting qarar_meetings.meetings%rowtype;v_created jsonb;v_topic_id uuid;v_item_id uuid;
  v_order integer;v_replay boolean;
begin
  if p_client_request_id is null then raise exception using errcode='22023',message='إيصال الإضافة مطلوب.';end if;
  if char_length(btrim(coalesce(p_title_ar,''))) not between 5 and 300 then
    raise exception using errcode='22023',message='عنوان الموضوع يجب أن يكون بين 5 و300 حرف.';
  end if;
  if char_length(coalesce(p_description,''))>10000 then raise exception using errcode='22023',message='وصف الموضوع أطول من الحد المسموح.';end if;
  if coalesce(p_priority,'medium') not in('low','medium','high','urgent') then raise exception using errcode='22023',message='أولوية الموضوع غير صالحة.';end if;
  select * into v_meeting from qarar_meetings.meetings where id=p_meeting_id and organization_id=v_org for update;
  if v_meeting.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id,array['council_chair']) then
    raise exception using errcode='42501',message='إضافة موضوع مباشر متاحة لرئيس المجلس فقط.';
  end if;
  if v_meeting.status not in('draft','scheduled') then raise exception using errcode='23514',message='لا يمكن إضافة موضوع بعد إغلاق تجهيز جدول الأعمال.';end if;
  v_created:=qarar_topics.create_meeting_scoped_topic(v_org,v_meeting.id,v_meeting.governance_unit_id,
    p_title_ar,p_description,coalesce(p_priority,'medium'),v_actor,p_client_request_id);
  v_topic_id:=(v_created->>'topic_id')::uuid;v_replay:=coalesce((v_created->>'idempotent_replay')::boolean,false);
  select id into v_item_id from qarar_meetings.agenda_items
  where meeting_id=v_meeting.id and topic_id=v_topic_id and organization_id=v_org;
  if v_item_id is not null then
    if (select requires_voting from qarar_meetings.agenda_items where id=v_item_id) is distinct from coalesce(p_requires_voting,false) then
      raise exception using errcode='40001',message='سبق استخدام إيصال الإضافة بخيار تصويت مختلف.';
    end if;
  else
    select coalesce(max(agenda_order),0)+1 into v_order from qarar_meetings.agenda_items where meeting_id=v_meeting.id;
    insert into qarar_meetings.agenda_items(organization_id,meeting_id,topic_id,agenda_order,agenda_status,requires_voting)
    values(v_org,v_meeting.id,v_topic_id,v_order,'pending',coalesce(p_requires_voting,false)) returning id into v_item_id;
    update qarar_meetings.meetings set updated_at=clock_timestamp() where id=v_meeting.id and organization_id=v_org;
    perform qarar_audit.append_audit_log(v_org,'meetings.direct_topic.add','agenda_items',v_item_id,
      jsonb_build_object('meeting_id',v_meeting.id,'topic_id',v_topic_id,'topic_no',v_created->>'topic_no',
        'requires_voting',coalesce(p_requires_voting,false)));
  end if;
  return v_created||jsonb_build_object('meeting_id',v_meeting.id,'agenda_item_id',v_item_id,
    'requires_voting',coalesce(p_requires_voting,false),'idempotent_replay',v_replay);
end;
$$;
alter function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,boolean,uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,boolean,uuid) to qarar_api_executor;

create function api_v2.create_direct_agenda_topic_v2(
  p_meeting_id uuid,p_title_ar text,p_description text default null,p_priority text default 'medium',
  p_requires_voting boolean default false,p_client_request_id uuid default null
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.create_direct_agenda_topic($1,$2,$3,$4,$5,$6)$$;
alter function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,boolean,uuid) owner to qarar_api_executor;
revoke all on function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,boolean,uuid) from public,anon,service_role;
grant execute on function api_v2.create_direct_agenda_topic_v2(uuid,text,text,text,boolean,uuid) to authenticated;
delete from qarar_architecture.api_contract_registry where api_version='v2' and contract_name='create_direct_agenda_topic_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','create_direct_agenda_topic_v2','qarar_meetings','create_direct_agenda_topic',
  'p_meeting_id uuid, p_title_ar text, p_description text, p_priority text, p_requires_voting boolean, p_client_request_id uuid','meetings','authenticated');

create or replace function qarar_governance.get_topic_agenda_context(p_topic_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'workflow_step_type',current_ts.step_type,'workflow_responsibility',current_ts.responsibility,
    'workflow_step_name_ar',case when t.meeting_scope_id is not null then 'موضوع مباشر' else current_ts.name_ar end,
    'requires_voting',case when t.meeting_scope_id is not null then coalesce(direct_item.requires_voting,false) else true end,
    'voting_available_now',case when t.meeting_scope_id is not null and not coalesce(direct_item.requires_voting,false) then false else plan.value->>'mode' is not null end,
    'voting_unavailable_reason',case when t.meeting_scope_id is not null and not coalesce(direct_item.requires_voting,false)
      then 'هذا الموضوع مخصص للمناقشة أو الإحاطة ولا يتطلب تصويتاً.' else plan.value->>'reason' end
  )
  from qarar_topics.topics t
  left join qarar_meetings.agenda_items direct_item on direct_item.topic_id=t.id and direct_item.meeting_id=t.meeting_scope_id
  left join qarar_governance.workflow_instance_steps current_step on current_step.id=t.current_workflow_step_id and current_step.workflow_instance_id=t.workflow_instance_id
  left join qarar_governance.workflow_template_steps current_ts on current_ts.id=current_step.template_step_id
  cross join lateral(select case
    when t.meeting_scope_id is not null and coalesce(direct_item.requires_voting,false) then jsonb_build_object('mode','direct','reason',null)
    when t.meeting_scope_id is not null then jsonb_build_object('mode',null,'reason','هذا الموضوع لا يتطلب تصويتاً.')
    when t.governance_source='legacy' then jsonb_build_object('mode','legacy','reason',null)
    when t.routing_status<>'routing_ready' or t.workflow_instance_id is null then jsonb_build_object('mode',null,'reason','مسار حوكمة الموضوع غير جاهز، فلا يُفتح التصويت.')
    else qarar_governance.meeting_vote_plan(current_step.id) end as value) plan
  where t.id=p_topic_id and t.organization_id=qarar_iam.current_organization_id()
$$;
alter function qarar_governance.get_topic_agenda_context(uuid) owner to qarar_governance_executor;

create function qarar_voting.guard_optional_direct_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists(
    select 1 from qarar_meetings.agenda_items ai join qarar_topics.topics t on t.id=ai.topic_id
    where ai.id=new.agenda_item_id and ai.organization_id=new.organization_id
      and t.meeting_scope_id is not null and not ai.requires_voting
  ) then raise exception using errcode='23514',message='هذا الموضوع لا يتطلب تصويتاً.';end if;
  return new;
end;
$$;
alter function qarar_voting.guard_optional_direct_vote() owner to qarar_voting_executor;
revoke all on function qarar_voting.guard_optional_direct_vote() from public,anon,authenticated,service_role;
create trigger aa_optional_direct_vote_guard before insert on qarar_voting.voting_rounds
for each row execute function qarar_voting.guard_optional_direct_vote();

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_detail jsonb;v_can_direct boolean;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'status','') in('draft','scheduled')
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  v_detail:=jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
  return jsonb_set(v_detail,'{agenda_items}',coalesce((
    select jsonb_agg(jsonb_set(item,'{topic}',(item->'topic')||jsonb_build_object('is_direct',t.meeting_scope_id is not null))
      order by (item->>'agenda_order')::integer)
    from jsonb_array_elements(v_detail->'agenda_items') item
    join qarar_topics.topics t on t.id=(item#>>'{topic,id}')::uuid and t.organization_id=qarar_iam.current_organization_id()
  ),'[]'::jsonb),true);
end;
$$;
alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;

create or replace function qarar_meetings.require_vote_for_agenda_items()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_item record;
begin
  if new.status='waiting_for_minutes' and old.status is distinct from new.status then
    select ai.agenda_order,t.title_ar into v_item
    from qarar_meetings.agenda_items ai join qarar_topics.topics t on t.id=ai.topic_id
    where ai.meeting_id=new.id and ai.requires_voting and ai.agenda_status<>'postponed'
      and not exists(select 1 from qarar_meetings.agenda_item_referrals r where r.agenda_item_id=ai.id)
      and not exists(select 1 from qarar_voting.voting_rounds vr where vr.agenda_item_id=ai.id and vr.status='closed')
    order by ai.agenda_order limit 1;
    if v_item.agenda_order is not null then
      raise exception 'صوّت المجلس على البند % «%» أو أحِله أو أجّله بسبب موثق قبل إنهاء الجلسة.',v_item.agenda_order,v_item.title_ar using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
alter function qarar_meetings.require_vote_for_agenda_items() owner to qarar_meetings_executor;

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
