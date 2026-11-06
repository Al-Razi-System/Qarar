-- Issue, confirm, and withdraw a logical assignment for many resolved targets atomically.
begin;

create function qarar_meetings.meeting_assignment_batch_payload(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'id',b.id,'meeting_id',b.meeting_id,'agenda_item_id',b.agenda_item_id,
    'decision_id',b.decision_id,'title_ar',b.title_ar,'description',b.description,
    'follow_up_user_id',b.follow_up_user_id,'due_date',b.due_date,
    'requires_evidence',b.requires_evidence,'status',b.status,
    'target_count',b.target_count,'revision',b.revision,
    'targets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'target_kind',t.target_kind,'target_user_id',t.target_user_id,
        'target_unit_id',t.target_unit_id,'resolved_user_id',t.resolved_user_id,
        'resolved_user_name_ar',t.resolved_user_name_ar,
        'resolved_unit_name_ar',t.resolved_unit_name_ar,
        'selection_kind',t.selection_kind,'assignment_id',t.legacy_assignment_id,
        'action_no',a.action_no,'action_status',a.status
      ) order by coalesce(t.resolved_unit_name_ar,t.resolved_user_name_ar))
      from qarar_meetings.meeting_assignment_targets t
      left join qarar_meetings.meeting_assignments ma
        on ma.id=t.legacy_assignment_id and ma.organization_id=t.organization_id
      left join qarar_execution.action_items a
        on a.id=ma.action_item_id and a.organization_id=ma.organization_id
      where t.batch_id=b.id and t.organization_id=b.organization_id
    ),'[]'::jsonb)
  )
  from qarar_meetings.meeting_assignment_batches b
  where b.id=p_batch_id and b.organization_id=qarar_iam.current_organization_id()
$$;

create function qarar_meetings.propose_meeting_assignment_batch(
  p_agenda_item_id uuid,p_title text,p_description text,p_selections jsonb,
  p_due_date date,p_follow_up_user_id uuid,p_requires_evidence boolean,p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_item qarar_meetings.agenda_items%rowtype;
  v_decision_id uuid;
  v_ctx jsonb;
  v_preview jsonb;
  v_batch qarar_meetings.meeting_assignment_batches%rowtype;
  v_target jsonb;
  v_assignment jsonb;
begin
  if p_client_request_id is null then
    raise exception using errcode='22023',message='تعذر تأمين الطلب. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  select * into v_item from qarar_meetings.agenda_items
  where id=p_agenda_item_id and organization_id=v_org for update;
  if v_item.id is null then raise exception using errcode='P0002',message='البند غير موجود.';end if;

  select * into v_batch from qarar_meetings.meeting_assignment_batches
  where organization_id=v_org and proposed_by_user_id=v_actor and client_request_id=p_client_request_id;
  if v_batch.id is not null then
    if v_batch.agenda_item_id<>p_agenda_item_id
       or v_batch.title_ar<>btrim(p_title)
       or coalesce(v_batch.description,'')<>btrim(coalesce(p_description,''))
       or v_batch.selection_snapshot<>p_selections
       or v_batch.due_date is distinct from p_due_date
       or v_batch.follow_up_user_id<>p_follow_up_user_id
       or v_batch.requires_evidence<>coalesce(p_requires_evidence,false) then
      raise exception using errcode='23505',message='استُخدم معرّف الطلب نفسه لبيانات مختلفة. حدّث الصفحة وأعد المحاولة.';
    end if;
    return qarar_meetings.meeting_assignment_batch_payload(v_batch.id);
  end if;

  v_preview:=qarar_meetings.preview_meeting_assignment_targets(p_agenda_item_id,p_selections);
  if jsonb_array_length(v_preview->'blockers')>0 then
    raise exception using errcode='23514',message='تعذر إصدار التكليف لأن بعض الجهات لا تملك مسؤولاً محدداً.';
  end if;
  if coalesce((v_preview->>'count')::integer,0)=0 then
    raise exception using errcode='22023',message='لم ينتج عن الاختيار أي مستهدف صالح.';
  end if;

  select id into v_decision_id from qarar_decisions.decisions
  where agenda_item_id=v_item.id and organization_id=v_org;
  if v_decision_id is null then
    raise exception using errcode='23514',message='صغ قرار البند أولاً، ثم أضف تكليفاته.';
  end if;
  v_ctx:=qarar_meetings.assignment_context(v_item.meeting_id);

  insert into qarar_meetings.meeting_assignment_batches(
    organization_id,meeting_id,agenda_item_id,decision_id,title_ar,description,
    follow_up_user_id,due_date,requires_evidence,selection_snapshot,status,target_count,
    proposed_by_user_id,issued_by_user_id,issued_at,client_request_id
  ) values(
    v_org,v_item.meeting_id,v_item.id,v_decision_id,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),
    p_follow_up_user_id,p_due_date,coalesce(p_requires_evidence,false),p_selections,
    case when (v_ctx->>'chair')::boolean then 'active' else 'proposed' end,
    (v_preview->>'count')::integer,v_actor,
    case when (v_ctx->>'chair')::boolean then v_actor end,
    case when (v_ctx->>'chair')::boolean then clock_timestamp() end,p_client_request_id
  ) returning * into v_batch;

  for v_target in select value from jsonb_array_elements(v_preview->'targets') loop
    v_assignment:=qarar_meetings.propose_meeting_assignment(
      p_agenda_item_id,p_title,p_description,(v_target->>'resolved_user_id')::uuid,
      case when v_target->>'target_kind'='unit' then (v_target->>'target_unit_id')::uuid end,
      p_due_date,p_follow_up_user_id,p_requires_evidence
    );
    update qarar_meetings.meeting_assignments set assignment_batch_id=v_batch.id
    where id=(v_assignment->>'id')::uuid and organization_id=v_org;
    insert into qarar_meetings.meeting_assignment_targets(
      organization_id,batch_id,target_kind,target_user_id,target_unit_id,resolved_user_id,
      resolved_user_name_ar,resolved_unit_name_ar,selection_kind,source_unit_type_id,
      source_scope_unit_id,legacy_assignment_id
    ) values(
      v_org,v_batch.id,v_target->>'target_kind',(v_target->>'target_user_id')::uuid,
      (v_target->>'target_unit_id')::uuid,(v_target->>'resolved_user_id')::uuid,
      v_target->>'resolved_user_name_ar',v_target->>'resolved_unit_name_ar',
      v_target->>'selection_kind',(v_target->>'source_unit_type_id')::uuid,
      (v_target->>'source_scope_unit_id')::uuid,(v_assignment->>'id')::uuid
    );
  end loop;
  perform qarar_audit.append_audit_log(v_org,'meetings.assignment_batch.propose','meeting_assignment_batches',v_batch.id,
    jsonb_build_object('meeting_id',v_batch.meeting_id,'agenda_item_id',v_batch.agenda_item_id,
      'status',v_batch.status,'target_count',v_batch.target_count));
  return qarar_meetings.meeting_assignment_batch_payload(v_batch.id);
end;
$$;

create function qarar_meetings.confirm_meeting_assignment_batch(p_batch_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_batch qarar_meetings.meeting_assignment_batches%rowtype;v_target record;
begin
  select * into v_batch from qarar_meetings.meeting_assignment_batches
  where id=p_batch_id and organization_id=v_org for update;
  if v_batch.id is null then raise exception using errcode='P0002',message='مجموعة التكليفات غير موجودة.';end if;
  if p_expected_revision is null or p_expected_revision<>v_batch.revision then
    raise exception using errcode='40001',message='تغيّرت مجموعة التكليفات من شاشة أخرى. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if v_batch.status<>'proposed' then raise exception using errcode='23514',message='لم تعد هذه المجموعة مقترحة.';end if;
  for v_target in select ma.id,ma.revision from qarar_meetings.meeting_assignment_targets t
    join qarar_meetings.meeting_assignments ma on ma.id=t.legacy_assignment_id and ma.organization_id=t.organization_id
    where t.batch_id=v_batch.id and t.organization_id=v_org order by t.created_at
  loop perform qarar_meetings.confirm_meeting_assignment(v_target.id,v_target.revision);end loop;
  update qarar_meetings.meeting_assignment_batches set status='active',issued_by_user_id=auth.uid(),
    issued_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
  where id=v_batch.id and organization_id=v_org;
  perform qarar_audit.append_audit_log(v_org,'meetings.assignment_batch.confirm','meeting_assignment_batches',v_batch.id,
    jsonb_build_object('meeting_id',v_batch.meeting_id,'target_count',v_batch.target_count));
  return qarar_meetings.meeting_assignment_batch_payload(v_batch.id);
end;
$$;

create function qarar_meetings.withdraw_meeting_assignment_batch(p_batch_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_batch qarar_meetings.meeting_assignment_batches%rowtype;v_target record;
begin
  select * into v_batch from qarar_meetings.meeting_assignment_batches
  where id=p_batch_id and organization_id=v_org for update;
  if v_batch.id is null then raise exception using errcode='P0002',message='مجموعة التكليفات غير موجودة.';end if;
  if p_expected_revision is null or p_expected_revision<>v_batch.revision then
    raise exception using errcode='40001',message='تغيّرت مجموعة التكليفات من شاشة أخرى. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if v_batch.status='withdrawn' then raise exception using errcode='23514',message='سُحبت هذه المجموعة من قبل.';end if;
  for v_target in select ma.id,ma.revision from qarar_meetings.meeting_assignment_targets t
    join qarar_meetings.meeting_assignments ma on ma.id=t.legacy_assignment_id and ma.organization_id=t.organization_id
    where t.batch_id=v_batch.id and t.organization_id=v_org order by t.created_at
  loop perform qarar_meetings.withdraw_meeting_assignment(v_target.id,v_target.revision);end loop;
  update qarar_meetings.meeting_assignment_batches set status='withdrawn',revision=revision+1,updated_at=clock_timestamp()
  where id=v_batch.id and organization_id=v_org;
  perform qarar_audit.append_audit_log(v_org,'meetings.assignment_batch.withdraw','meeting_assignment_batches',v_batch.id,
    jsonb_build_object('meeting_id',v_batch.meeting_id,'target_count',v_batch.target_count));
  return qarar_meetings.meeting_assignment_batch_payload(v_batch.id);
end;
$$;

create function api_v2.propose_meeting_assignment_batch_v2(
  p_agenda_item_id uuid,p_title text,p_description text,p_selections jsonb,p_due_date date,
  p_follow_up_user_id uuid,p_requires_evidence boolean,p_client_request_id uuid
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.propose_meeting_assignment_batch($1,$2,$3,$4,$5,$6,$7,$8)$$;
create function api_v2.confirm_meeting_assignment_batch_v2(p_batch_id uuid,p_expected_revision integer)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.confirm_meeting_assignment_batch($1,$2)$$;
create function api_v2.withdraw_meeting_assignment_batch_v2(p_batch_id uuid,p_expected_revision integer)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.withdraw_meeting_assignment_batch($1,$2)$$;

alter function qarar_meetings.meeting_assignment_batch_payload(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.propose_meeting_assignment_batch(uuid,text,text,jsonb,date,uuid,boolean,uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.confirm_meeting_assignment_batch(uuid,integer) owner to qarar_meetings_executor;
alter function qarar_meetings.withdraw_meeting_assignment_batch(uuid,integer) owner to qarar_meetings_executor;
alter function api_v2.propose_meeting_assignment_batch_v2(uuid,text,text,jsonb,date,uuid,boolean,uuid) owner to qarar_api_executor;
alter function api_v2.confirm_meeting_assignment_batch_v2(uuid,integer) owner to qarar_api_executor;
alter function api_v2.withdraw_meeting_assignment_batch_v2(uuid,integer) owner to qarar_api_executor;

revoke all on function qarar_meetings.meeting_assignment_batch_payload(uuid),
  qarar_meetings.propose_meeting_assignment_batch(uuid,text,text,jsonb,date,uuid,boolean,uuid),
  qarar_meetings.confirm_meeting_assignment_batch(uuid,integer),
  qarar_meetings.withdraw_meeting_assignment_batch(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.meeting_assignment_batch_payload(uuid),
  qarar_meetings.propose_meeting_assignment_batch(uuid,text,text,jsonb,date,uuid,boolean,uuid),
  qarar_meetings.confirm_meeting_assignment_batch(uuid,integer),
  qarar_meetings.withdraw_meeting_assignment_batch(uuid,integer) to qarar_api_executor;
revoke all on function api_v2.propose_meeting_assignment_batch_v2(uuid,text,text,jsonb,date,uuid,boolean,uuid),
  api_v2.confirm_meeting_assignment_batch_v2(uuid,integer),api_v2.withdraw_meeting_assignment_batch_v2(uuid,integer)
  from public,anon,service_role;
grant execute on function api_v2.propose_meeting_assignment_batch_v2(uuid,text,text,jsonb,date,uuid,boolean,uuid),
  api_v2.confirm_meeting_assignment_batch_v2(uuid,integer),api_v2.withdraw_meeting_assignment_batch_v2(uuid,integer)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.meeting_assignment_batch_payload(uuid)'::regprocedure,
  'qarar_meetings.propose_meeting_assignment_batch(uuid,text,text,jsonb,date,uuid,boolean,uuid)'::regprocedure,
  'qarar_meetings.confirm_meeting_assignment_batch(uuid,integer)'::regprocedure,
  'qarar_meetings.withdraw_meeting_assignment_batch(uuid,integer)'::regprocedure
) on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','propose_meeting_assignment_batch_v2','qarar_meetings','propose_meeting_assignment_batch','p_agenda_item_id uuid, p_title text, p_description text, p_selections jsonb, p_due_date date, p_follow_up_user_id uuid, p_requires_evidence boolean, p_client_request_id uuid','meetings','authenticated'),
('v2','confirm_meeting_assignment_batch_v2','qarar_meetings','confirm_meeting_assignment_batch','p_batch_id uuid, p_expected_revision integer','meetings','authenticated'),
('v2','withdraw_meeting_assignment_batch_v2','qarar_meetings','withdraw_meeting_assignment_batch','p_batch_id uuid, p_expected_revision integer','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
