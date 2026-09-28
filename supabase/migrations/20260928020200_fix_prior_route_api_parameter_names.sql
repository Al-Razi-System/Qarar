begin;

-- PostgREST resolves JSON RPC calls by argument name. The initial facades used
-- positional arguments only, so valid browser calls could not resolve them.
drop function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid);
drop function api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid);
drop function api_v1.add_prior_route_evidence_attachment(uuid,uuid);
drop function api_v1.submit_topic_prior_route_request(uuid);
drop function api_v1.admin_list_topic_prior_route_requests(text);
drop function api_v1.review_topic_prior_route_request(uuid,text,text);

create function api_v1.get_topic_prior_route_candidate_steps(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text,
  p_source_type text,
  p_effective_on date,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_governance.get_topic_prior_route_candidate_steps(
  p_governance_unit_id,p_topic_category_id,p_priority,p_source_type,p_effective_on,
  p_policy_id,p_policy_version_id,p_policy_item_id,p_scope_assignment_id
)$$;

create function api_v1.create_topic_prior_route_request(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_policy_id uuid,
  p_policy_version_id uuid,
  p_policy_item_id uuid,
  p_scope_assignment_id uuid,
  p_evidence jsonb,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_governance.create_topic_prior_route_request(
  p_title_ar,p_description,p_category_id,p_current_unit_id,p_policy_id,p_policy_version_id,
  p_policy_item_id,p_scope_assignment_id,p_evidence,p_priority,p_source_type,p_title_en,p_client_request_id
)$$;

create function api_v1.add_prior_route_evidence_attachment(
  p_step_evidence_id uuid,
  p_topic_attachment_id uuid
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_governance.add_prior_route_evidence_attachment(p_step_evidence_id,p_topic_attachment_id)$$;

create function api_v1.submit_topic_prior_route_request(
  p_request_id uuid
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_governance.submit_topic_prior_route_request(p_request_id)$$;

create function api_v1.admin_list_topic_prior_route_requests(
  p_status text default null
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_governance.admin_list_topic_prior_route_requests(p_status)$$;

create function api_v1.review_topic_prior_route_request(
  p_request_id uuid,
  p_action text,
  p_comment text
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_governance.review_topic_prior_route_request(p_request_id,p_action,p_comment)$$;

alter function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid) owner to qarar_api_executor;
alter function api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) owner to qarar_api_executor;
alter function api_v1.add_prior_route_evidence_attachment(uuid,uuid) owner to qarar_api_executor;
alter function api_v1.submit_topic_prior_route_request(uuid) owner to qarar_api_executor;
alter function api_v1.admin_list_topic_prior_route_requests(text) owner to qarar_api_executor;
alter function api_v1.review_topic_prior_route_request(uuid,text,text) owner to qarar_api_executor;

grant execute on function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.add_prior_route_evidence_attachment(uuid,uuid),
  api_v1.submit_topic_prior_route_request(uuid),
  api_v1.admin_list_topic_prior_route_requests(text),
  api_v1.review_topic_prior_route_request(uuid,text,text)
to authenticated,service_role;

revoke execute on function api_v1.get_topic_prior_route_candidate_steps(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid),
  api_v1.create_topic_prior_route_request(text,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid),
  api_v1.add_prior_route_evidence_attachment(uuid,uuid),
  api_v1.submit_topic_prior_route_request(uuid),
  api_v1.admin_list_topic_prior_route_requests(text),
  api_v1.review_topic_prior_route_request(uuid,text,text)
from public,anon;

select pg_notify('pgrst','reload schema');

commit;
