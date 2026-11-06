-- A council deliberately starts inactive while its first agenda is assembled.
-- Topic preparation may use that origin, but every later route council stays
-- active and the meeting-session activation gate is intentionally unchanged.
-- Impact map: docs/engineering/impact/INACTIVE_COUNCIL_AGENDA_PREPARATION_AR.md
begin;

create or replace function qarar_governance.list_effective_topic_types_route_v2(
  p_origin_governance_unit_id uuid,p_effective_on date default current_date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_result jsonb;
begin
  perform qarar_iam.assert_permission('topics.create',p_origin_governance_unit_id);
  if p_effective_on is null then
    raise exception using errcode='22023',message='تاريخ السريان مطلوب';
  end if;
  if not exists(
    select 1 from qarar_core.governance_units u
    where u.id=p_origin_governance_unit_id and u.organization_id=v_org
      and u.status in('active','inactive')
  ) then
    raise exception using errcode='23514',message='المجلس غير متاح لتجهيز الموضوع';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'topic_type_version_id',v.id,'reference_number',v.reference_number,'topic_type_code',t.code,
    'topic_type_name_ar',t.name_ar,'classification_code',c.code,'classification_name_ar',c.name_ar,
    'is_governed',v.is_governed,'effective_from',v.effective_from,'effective_to',v.effective_to
  ) order by c.name_ar,t.name_ar),'[]'::jsonb) into v_result
  from qarar_governance.topic_type_versions_v2 v
  join qarar_governance.topic_types_v2 t on t.id=v.topic_type_id and t.organization_id=v.organization_id
  join qarar_governance.topic_classifications_v2 c on c.id=v.classification_id and c.organization_id=v.organization_id
  join qarar_governance.topic_type_workflow_bindings_v2 wb on wb.topic_type_version_id=v.id and wb.organization_id=v.organization_id and wb.status='effective'
  where v.organization_id=v_org and v.status='effective'
    and v.effective_from<=p_effective_on and (v.effective_to is null or v.effective_to>=p_effective_on)
    and wb.valid_from<=p_effective_on and (wb.valid_to is null or wb.valid_to>=p_effective_on)
    and exists(
      select 1 from qarar_governance.workflow_template_steps s
      where s.workflow_template_version_id=wb.workflow_template_version_id and s.organization_id=v_org
        and (s.is_initial or exists(
          select 1 from qarar_governance.topic_type_authoring_profiles_v2 profile
          where profile.organization_id=v_org and profile.topic_type_version_id=v.id
            and profile.scope_kind<>'route'
            and qarar_governance.topic_type_origin_allowed_v2(profile.topic_type_version_id,p_origin_governance_unit_id)
        ))
        and (
          qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id)=p_origin_governance_unit_id
          or exists(
            select 1 from qarar_governance.topic_type_authoring_profiles_v2 profile
            where profile.organization_id=v_org and profile.topic_type_version_id=v.id
              and profile.scope_kind<>'route'
              and qarar_governance.topic_type_origin_allowed_v2(profile.topic_type_version_id,p_origin_governance_unit_id)
          )
        )
    );
  return v_result;
end;
$$;

create or replace function qarar_governance.prepare_typed_topic_v2(p_version_id uuid,p_unit_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  tid uuid;
  result jsonb;
  option jsonb;
  wf uuid;
begin
  perform qarar_iam.assert_permission('topics.create',p_unit_id);
  select topic_type_id into tid from qarar_governance.topic_type_versions_v2
  where id=p_version_id and organization_id=o;
  if tid is null then raise exception using errcode='P0002',message='التصنيف غير موجود'; end if;
  perform 1 from qarar_governance.topic_types_v2 where id=tid and organization_id=o for update;

  select x into option
  from jsonb_array_elements(qarar_governance.list_effective_topic_types_v2(p_unit_id,current_date)) x
  where (x->>'topic_type_version_id')::uuid=p_version_id;
  if option is null then
    raise exception using errcode='23514',message='التصنيف غير متاح للتقديم في المجلس المحدد';
  end if;

  result:=qarar_governance.preview_topic_route_v2(p_version_id,p_unit_id,current_date);
  select workflow_template_version_id into wf
  from qarar_governance.topic_type_workflow_bindings_v2
  where topic_type_version_id=p_version_id and organization_id=o and status='effective';
  if not exists(
    select 1 from qarar_governance.workflow_template_versions
    where id=wf and organization_id=o and status='active' and validation_status='valid'
  ) then
    raise exception using errcode='23514',message='مسار التصنيف غير متاح للتقديم';
  end if;

  if jsonb_array_length(result->'steps')=0 or exists(
    select 1 from jsonb_array_elements(result->'steps') step
    where step->>'resolved_governance_unit_id' is null
      or not exists(
        select 1 from qarar_core.governance_units unit
        where unit.id=(step->>'resolved_governance_unit_id')::uuid
          and unit.organization_id=o
          and (
            unit.status='active'
            or (
              unit.status='inactive'
              and coalesce((step->>'is_initial')::boolean,false)
              and unit.id=p_unit_id
            )
          )
      )
  ) then
    raise exception using errcode='23514',message='أكمل تفعيل المجالس التالية في المسار قبل تجهيز الموضوع';
  end if;

  return result||option||jsonb_build_object(
    'topic_type_id',tid,
    'workflow_template_version_id',wf,
    'can_resume',qarar_iam.has_permission('governance.prior_route.request',p_unit_id),
    'prior_steps',(
      select jsonb_agg(jsonb_build_object('template_step_id',s.id,'name_ar',s.name_ar) order by s.sequence_no)
      from qarar_governance.workflow_template_steps s
      where s.workflow_template_version_id=wf and s.organization_id=o
    )
  );
end;
$$;

-- Enrich existing meeting read contracts without changing their arguments.
alter function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)
  rename to search_meetings_before_unit_status;

create function qarar_meetings.search_meetings(
  p_query text default null,p_status text default null,p_unit_id uuid default null,
  p_from_date date default null,p_to_date date default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  result:=qarar_meetings.search_meetings_before_unit_status(
    p_query,p_status,p_unit_id,p_from_date,p_to_date,p_limit,p_offset
  );
  return jsonb_set(result,'{items}',coalesce((
    select jsonb_agg(item||jsonb_build_object('governance_unit_status',unit.status))
    from jsonb_array_elements(result->'items') item
    left join qarar_core.governance_units unit
      on unit.id=(item->>'governance_unit_id')::uuid
      and unit.organization_id=qarar_iam.current_organization_id()
  ),'[]'::jsonb),true);
end;
$$;

alter function qarar_meetings.get_meeting_detail(uuid)
  rename to get_meeting_detail_before_unit_status;

create function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; unit_status text;
begin
  result:=qarar_meetings.get_meeting_detail_before_unit_status(p_meeting_id);
  select status into unit_status from qarar_core.governance_units
  where id=(result->>'governance_unit_id')::uuid
    and organization_id=qarar_iam.current_organization_id();
  return result||jsonb_build_object('governance_unit_status',unit_status);
end;
$$;

alter function qarar_governance.list_effective_topic_types_route_v2(uuid,date) owner to qarar_governance_executor;
alter function qarar_governance.prepare_typed_topic_v2(uuid,uuid) owner to qarar_governance_executor;
alter function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer) owner to qarar_meetings_executor;
alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;

revoke all on function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer),
  qarar_meetings.get_meeting_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer),
  qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_topics_executor;

update qarar_architecture.function_registry registry
set function_name=procedure.proname
from pg_proc procedure
where procedure.oid=registry.function_oid
  and procedure.proname in('search_meetings_before_unit_status','get_meeting_detail_before_unit_status');

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
) values
  ('qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)'::regprocedure,
   'search_meetings','p_query text, p_status text, p_unit_id uuid, p_from_date date, p_to_date date, p_limit integer, p_offset integer','meetings','qarar_meetings',false),
  ('qarar_meetings.get_meeting_detail(uuid)'::regprocedure,
   'get_meeting_detail','p_meeting_id uuid','meetings','qarar_meetings',false)
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,
    module_code=excluded.module_code,
    owning_schema=excluded.owning_schema,
    is_rls_predicate=excluded.is_rls_predicate;

comment on function qarar_governance.prepare_typed_topic_v2(uuid,uuid) is
  'Allows an inactive origin council to assemble its first agenda; downstream councils and live-session gates remain active-only.';
comment on function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer) is
  'Meeting search enriched with governance_unit_status so inactive councils are explicit in the UI.';

notify pgrst,'reload schema';
commit;
