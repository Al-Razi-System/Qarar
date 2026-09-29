begin;

create or replace function qarar_governance.get_topic_prior_route_summaries(p_topic_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_user uuid:=auth.uid();
begin
  if coalesce(cardinality(p_topic_ids),0)>100 then
    raise exception using errcode='22023',message='يمكن طلب ملخص 100 موضوع كحد أقصى';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'topic_id',r.topic_id,
      'status',r.status,
      'missing_evidence_count',(
        select count(*)
        from qarar_governance.topic_prior_route_step_evidence e
        where e.request_id=r.id
          and not exists(
            select 1 from qarar_governance.topic_prior_route_evidence_attachments a
            where a.step_evidence_id=e.id
          )
      )
    ))
    from qarar_governance.topic_prior_route_requests r
    join qarar_topics.topics t
      on t.id=r.topic_id and t.organization_id=r.organization_id
    where r.organization_id=v_org
      and r.topic_id=any(coalesce(p_topic_ids,'{}'::uuid[]))
      and (
        t.submitted_by_user_id=v_user
        or qarar_iam.has_permission('topics.read',t.current_unit_id)
      )
  ),'[]'::jsonb);
end
$$;

alter function qarar_governance.get_topic_prior_route_summaries(uuid[]) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_prior_route_summaries(uuid[]) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_prior_route_summaries(uuid[]) to qarar_api_executor;

create or replace function api_v1.get_topic_prior_route_summaries(p_topic_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$select qarar_governance.get_topic_prior_route_summaries(p_topic_ids)$$;

alter function api_v1.get_topic_prior_route_summaries(uuid[]) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_prior_route_summaries(uuid[]) from public,anon,authenticated,service_role;
grant execute on function api_v1.get_topic_prior_route_summaries(uuid[]) to authenticated,service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values(
  'v1','get_topic_prior_route_summaries','qarar_governance','get_topic_prior_route_summaries',
  'p_topic_ids uuid[]','governance','authenticated'
)
on conflict(api_version,contract_name,identity_arguments) do update set
  implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,
  module_code=excluded.module_code,
  audience=excluded.audience,
  deprecated_at=null,
  replacement_contract=null;

select pg_notify('pgrst','reload schema');
commit;
