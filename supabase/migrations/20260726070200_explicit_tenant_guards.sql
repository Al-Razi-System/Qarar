begin;

create or replace function qarar_topics.create_topic_with_workflow(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
declare v_org uuid:=qarar_iam.current_organization_id();
  v_topic jsonb;v_match jsonb;v_route jsonb;v_topic_id uuid;
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  v_topic:=qarar_topics.create_topic_unrouted(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,
    p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=(v_topic->>'id')::uuid;
  if coalesce((v_topic->>'idempotent_replay')::boolean,false) then
    return v_topic || jsonb_build_object(
      'routing_status',(select routing_status from qarar_topics.topics
        where id=v_topic_id and organization_id=v_org)
    );
  end if;
  v_match:=qarar_governance.resolve_topic_governance(
    p_current_unit_id,p_category_id,current_date,v_topic_id
  );
  if v_match->>'outcome'='resolved' then
    v_route:=qarar_governance.instantiate_topic_workflow(v_topic_id,(v_match->>'decision_id')::uuid);
  else
    v_route:=qarar_governance.record_unresolved_topic_governance(
      v_topic_id,(v_match->>'decision_id')::uuid,v_match->>'outcome'
    );
  end if;
  return v_topic || v_match || v_route;
end;
$$;

create or replace function qarar_topics.create_topic(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
begin
  if qarar_iam.current_organization_id() is null or auth.uid() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  return qarar_topics.create_topic_with_workflow(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,
    p_source_type,p_title_en,p_client_request_id
  );
end;
$$;

create or replace function qarar_governance.complete_topic_workflow_step(
  p_topic_id uuid,p_outcome_code text default 'approved',p_comment text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
begin
  if qarar_iam.current_organization_id() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  return qarar_governance.act_topic_workflow_step(p_topic_id,p_outcome_code,p_comment);
end;
$$;
create or replace function qarar_governance.return_topic_workflow_step(
  p_topic_id uuid,p_comment text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
begin
  if qarar_iam.current_organization_id() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  return qarar_governance.act_topic_workflow_step(p_topic_id,'returned',p_comment);
end;
$$;
create or replace function qarar_governance.reject_topic_workflow_step(
  p_topic_id uuid,p_comment text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
begin
  if qarar_iam.current_organization_id() is null then
    raise exception using errcode='42501',message='يلزم حساب نشط ومصادق عليه';
  end if;
  return qarar_governance.act_topic_workflow_step(p_topic_id,'rejected',p_comment);
end;
$$;

alter function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid)
  owner to qarar_topics_executor;
alter function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  owner to qarar_topics_executor;
alter function qarar_governance.complete_topic_workflow_step(uuid,text,text)
  owner to qarar_governance_executor;
alter function qarar_governance.return_topic_workflow_step(uuid,text)
  owner to qarar_governance_executor;
alter function qarar_governance.reject_topic_workflow_step(uuid,text)
  owner to qarar_governance_executor;

revoke all on function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function qarar_governance.complete_topic_workflow_step(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function qarar_governance.return_topic_workflow_step(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function qarar_governance.reject_topic_workflow_step(uuid,text)
  from public,anon,authenticated,service_role;

grant execute on function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  to qarar_api_executor;
grant execute on function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid)
  to qarar_api_executor;
grant execute on function qarar_governance.complete_topic_workflow_step(uuid,text,text)
  to qarar_api_executor;
grant execute on function qarar_governance.return_topic_workflow_step(uuid,text)
  to qarar_api_executor;
grant execute on function qarar_governance.reject_topic_workflow_step(uuid,text)
  to qarar_api_executor;

commit;
