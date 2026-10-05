begin;

create or replace function qarar_governance.get_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.model.read',null);
  select jsonb_build_object(
    'bundle',to_jsonb(b),'classification',to_jsonb(c),'topic_type',to_jsonb(t),'version',to_jsonb(v),
    'authorities',coalesce((select jsonb_agg(jsonb_build_object(
      'reference_number',l.reference_number,'source_document_name',l.source_document_name,
      'article_number',l.article_number,'clause_number',l.clause_number,'authority_text',l.authority_text,
      'authority_kind',l.authority_kind,'authority_role',a.authority_role,'requirement_level',a.requirement_level
    ) order by a.priority desc,l.reference_number)
      from qarar_governance.topic_type_authorities_v2 a
      join qarar_governance.legal_authorities_v2 l on l.id=a.legal_authority_id and l.organization_id=a.organization_id
      where a.topic_type_version_id=v.id and a.organization_id=v_org),'[]'::jsonb),
    'workflow_binding',to_jsonb(wb),'schedule',to_jsonb(sp),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
      from qarar_governance.governance_bundle_reviews_v2 r
      where r.bundle_id=b.id and r.organization_id=v_org),'[]'::jsonb)
  ) into v_result
  from qarar_governance.governance_bundles_v2 b
  join qarar_governance.topic_type_versions_v2 v on v.id=b.topic_type_version_id and v.organization_id=b.organization_id
  join qarar_governance.topic_types_v2 t on t.id=v.topic_type_id and t.organization_id=v.organization_id
  join qarar_governance.topic_classifications_v2 c on c.id=v.classification_id and c.organization_id=v.organization_id
  left join qarar_governance.topic_type_workflow_bindings_v2 wb on wb.topic_type_version_id=v.id and wb.organization_id=v.organization_id
  left join qarar_governance.topic_schedule_policies_v2 sp on sp.topic_type_version_id=v.id and sp.organization_id=v.organization_id
  where b.id=p_bundle_id and b.organization_id=v_org;
  if v_result is null then raise exception using errcode='P0002',message='تعذر العثور على حزمة الحوكمة المطلوبة'; end if;
  return v_result;
end;
$$;

create or replace function qarar_governance.list_effective_topic_types_v2(
  p_origin_governance_unit_id uuid,p_effective_on date default current_date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_result jsonb;
begin
  perform qarar_iam.assert_permission('topics.create',p_origin_governance_unit_id);
  if p_effective_on is null then raise exception using errcode='22023',message='تاريخ السريان مطلوب'; end if;
  if not exists(select 1 from qarar_core.governance_units u where u.id=p_origin_governance_unit_id and u.organization_id=v_org and u.status='active') then
    raise exception using errcode='23514',message='وحدة إنشاء الموضوع غير صالحة أو غير نشطة';
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
    and exists(select 1 from qarar_governance.workflow_template_steps s
      where s.workflow_template_version_id=wb.workflow_template_version_id and s.organization_id=v_org and s.is_initial
        and qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id)=p_origin_governance_unit_id);
  return v_result;
end;
$$;

create or replace function qarar_governance.preview_topic_route_v2(
  p_topic_type_version_id uuid,p_origin_governance_unit_id uuid,p_effective_on date default current_date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_version qarar_governance.topic_type_versions_v2%rowtype;
  v_workflow_id uuid;
  v_schedule jsonb;
  v_steps jsonb;
  v_authorities jsonb;
begin
  perform qarar_iam.assert_permission('topics.create',p_origin_governance_unit_id);
  if p_effective_on is null then raise exception using errcode='22023',message='تاريخ السريان مطلوب'; end if;
  select * into v_version from qarar_governance.topic_type_versions_v2
  where id=p_topic_type_version_id and organization_id=v_org and status='effective'
    and effective_from<=p_effective_on and (effective_to is null or effective_to>=p_effective_on);
  if v_version.id is null then raise exception using errcode='P0002',message='نوع الموضوع غير فعال في التاريخ المحدد'; end if;
  select workflow_template_version_id into v_workflow_id from qarar_governance.topic_type_workflow_bindings_v2
  where topic_type_version_id=v_version.id and organization_id=v_org and status='effective'
    and valid_from<=p_effective_on and (valid_to is null or valid_to>=p_effective_on);
  if v_workflow_id is null or not exists(select 1 from qarar_governance.workflow_template_steps s
    where s.workflow_template_version_id=v_workflow_id and s.organization_id=v_org and s.is_initial
      and qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id)=p_origin_governance_unit_id) then
    raise exception using errcode='42501',message='نوع الموضوع غير متاح لوحدة الإنشاء المحددة';
  end if;
  select to_jsonb(s) into v_schedule from qarar_governance.topic_schedule_policies_v2 s
  where s.topic_type_version_id=v_version.id and s.organization_id=v_org and s.status='effective'
    and s.effective_from<=p_effective_on and (s.effective_to is null or s.effective_to>=p_effective_on);
  select coalesce(jsonb_agg(jsonb_build_object(
    'step_code',s.step_code,'name_ar',s.name_ar,'sequence_no',s.sequence_no,'step_type',s.step_type,
    'responsibility',s.responsibility,'resolved_governance_unit_id',
      qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id),
    'required_permission_code',s.required_permission_code,'is_initial',s.is_initial,'is_terminal',s.is_terminal,
    'allowed_outcomes',to_jsonb(s.allowed_outcomes)
  ) order by s.sequence_no),'[]'::jsonb) into v_steps
  from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=v_workflow_id and s.organization_id=v_org;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reference_number',l.reference_number,'source_document_name',l.source_document_name,'article_number',l.article_number,
    'clause_number',l.clause_number,'authority_text',l.authority_text,'authority_role',a.authority_role,
    'requirement_level',a.requirement_level
  ) order by a.priority desc,l.reference_number),'[]'::jsonb) into v_authorities
  from qarar_governance.topic_type_authorities_v2 a join qarar_governance.legal_authorities_v2 l
    on l.id=a.legal_authority_id and l.organization_id=a.organization_id
  where a.topic_type_version_id=v_version.id and a.organization_id=v_org and l.review_status='approved' and l.activation_allowed;
  return jsonb_build_object('topic_type_version_id',v_version.id,'acceptance_finality',v_version.acceptance_finality,
    'rejection_finality',v_version.rejection_finality,'authorities',v_authorities,'steps',v_steps,'schedule',v_schedule);
end;
$$;

alter function qarar_governance.get_governance_bundle_v2(uuid) owner to qarar_governance_executor;
alter function qarar_governance.list_effective_topic_types_v2(uuid,date) owner to qarar_governance_executor;
alter function qarar_governance.preview_topic_route_v2(uuid,uuid,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_governance_bundle_v2(uuid),
  qarar_governance.list_effective_topic_types_v2(uuid,date),
  qarar_governance.preview_topic_route_v2(uuid,uuid,date)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_governance_bundle_v2(uuid),
  qarar_governance.list_effective_topic_types_v2(uuid,date),
  qarar_governance.preview_topic_route_v2(uuid,uuid,date)
to qarar_governance_executor;

commit;
