begin;

create or replace function qarar_governance.admin_validate_policy_version_readiness(
  p_policy_version_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_errors jsonb:='[]';
  v_warnings jsonb:='[]';
  v_total integer;
  v_ready integer;
  v_score integer;
  v_is_ready boolean;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if not exists(
    select 1 from qarar_governance.policy_versions
    where id=p_policy_version_id and organization_id=v_org
  ) then
    raise exception using errcode='P0002',message='إصدار اللائحة غير موجود';
  end if;

  if not exists(select 1 from qarar_governance.policy_items where policy_version_id=p_policy_version_id) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','NO_ITEMS','message','أضف مادة واحدة على الأقل.'));
  end if;
  if not exists(select 1 from qarar_governance.policy_scope_assignments where policy_version_id=p_policy_version_id and is_active) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','NO_SCOPE','message','حدد نطاق تطبيق واحدًا على الأقل.'));
  end if;
  if exists(
    select 1 from qarar_governance.policy_items
    where policy_version_id=p_policy_version_id
      and item_type in('article','clause')
      and nullif(btrim(coalesce(official_text,body_text,'')),'') is null
  ) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_OFFICIAL_TEXT','message','توجد مواد أو فقرات بلا نص رسمي.'));
  end if;
  if exists(
    select 1 from qarar_governance.policy_items i
    where i.policy_version_id=p_policy_version_id and i.requires_executable_rule
      and not exists(select 1 from qarar_governance.policy_rules r where r.policy_item_id=i.id and r.status<>'retired')
  ) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_RULE','message','توجد مواد تنفيذية بلا قواعد رقمية.'));
  end if;
  if exists(
    select 1 from qarar_governance.policy_rules r
    join qarar_governance.policy_items i on i.id=r.policy_item_id
    where i.policy_version_id=p_policy_version_id and r.requires_workflow
      and not exists(select 1 from qarar_governance.rule_workflow_bindings b where b.policy_rule_id=r.id)
  ) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_WORKFLOW','message','توجد قواعد إجرائية بلا مسار اعتماد.'));
  end if;
  if exists(
    select 1 from qarar_governance.policy_rules r
    join qarar_governance.policy_items i on i.id=r.policy_item_id
    where i.policy_version_id=p_policy_version_id and r.rule_type in('authority','routing')
      and not exists(select 1 from qarar_governance.rule_authorities a where a.policy_rule_id=r.id)
  ) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_AUTHORITY','message','توجد قواعد صلاحيات أو إحالة بلا جهة مختصة.'));
  end if;
  if exists(
    select 1 from qarar_governance.policy_items
    where policy_version_id=p_policy_version_id and item_type in('article','clause') and source_page_from is null
  ) then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','MISSING_PAGE','message','بعض المواد لا تحتوي رقم الصفحة في المصدر.'));
  end if;
  if not exists(select 1 from qarar_governance.policy_attachments where policy_version_id=p_policy_version_id) then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','MISSING_SOURCE_FILE','message','لم يرفق ملف المصدر مع الإصدار.'));
  end if;

  select count(*),count(*) filter(
    where (not requires_executable_rule)
      or exists(select 1 from qarar_governance.policy_rules r where r.policy_item_id=i.id)
  ) into v_total,v_ready
  from qarar_governance.policy_items i
  where policy_version_id=p_policy_version_id;

  v_is_ready:=jsonb_array_length(v_errors)=0;
  v_score:=case
    when not v_is_ready then greatest(0,70-jsonb_array_length(v_errors)*15)
    else least(100,85+v_ready*15/greatest(v_total,1))
  end;

  update qarar_governance.policy_versions
  set readiness_percent=v_score,
      automation_status=case
        when v_is_ready and v_score=100 then 'ready'
        when v_score>0 then 'partially_ready'
        else 'not_configured'
      end,
      updated_at=now()
  where id=p_policy_version_id and organization_id=v_org;

  return jsonb_build_object(
    'ready',v_is_ready,'score',v_score,'errors',v_errors,'warnings',v_warnings,
    'items_total',v_total,'items_ready',v_ready
  );
end
$$;

create or replace function api_v1.admin_validate_policy_version_readiness(
  p_policy_version_id uuid
) returns jsonb
language sql
volatile
security definer
set search_path=pg_catalog
as $$
  select qarar_governance.admin_validate_policy_version_readiness($1)
$$;

alter function qarar_governance.admin_validate_policy_version_readiness(uuid) owner to qarar_governance_executor;
alter function api_v1.admin_validate_policy_version_readiness(uuid) owner to qarar_api_executor;
revoke all on function api_v1.admin_validate_policy_version_readiness(uuid) from public,anon;
grant execute on function api_v1.admin_validate_policy_version_readiness(uuid) to authenticated,service_role;
grant execute on function qarar_governance.admin_validate_policy_version_readiness(uuid) to qarar_api_executor;

commit;
