-- PostgREST matches JSON RPC payloads by argument name. Recreate the service
-- wrappers with the names used by the standalone notification worker.
begin;

delete from qarar_architecture.function_registry
where owning_schema='api_v1' and function_name in(
 'service_materialize_notification_delivery','service_claim_notification_deliveries',
 'service_complete_notification_delivery','service_fail_notification_delivery',
 'service_get_notification_dispatch_context','service_skip_notification_delivery',
 'service_mark_notification_delivery_ambiguous'
);
delete from qarar_architecture.api_contract_registry
where api_version='v1' and contract_name in(
 'service_materialize_notification_delivery','service_claim_notification_deliveries',
 'service_complete_notification_delivery','service_fail_notification_delivery',
 'service_get_notification_dispatch_context','service_skip_notification_delivery',
 'service_mark_notification_delivery_ambiguous'
);

drop function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb);
drop function api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer);
drop function api_v1.service_complete_notification_delivery(uuid,uuid,text,text);
drop function api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer);
drop function api_v1.service_get_notification_dispatch_context(uuid,uuid);
drop function api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text);
drop function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text);

create function api_v1.service_materialize_notification_delivery(
 p_event_id uuid,p_lock_token uuid,p_channel text,p_template_code text,p_template_version text,p_destination text,p_variables jsonb
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.materialize_notification_delivery($1,$2,$3,$4,$5,$6,$7)$$;
create function api_v1.service_claim_notification_deliveries(
 p_worker_id uuid,p_lock_token uuid,p_channel text,p_limit integer,p_lease_seconds integer
) returns table(id uuid,organization_id uuid,outbox_event_id uuid,recipient_user_id uuid,channel text,template_code text,template_version text,destination text,variables jsonb,status text,attempts integer,lock_token uuid,lease_expires_at timestamptz)
language sql security definer set search_path=pg_catalog as
$$select * from qarar_governance.claim_notification_deliveries($1,$2,$3,$4,$5)$$;
create function api_v1.service_complete_notification_delivery(
 p_delivery_id uuid,p_lock_token uuid,p_provider_code text,p_provider_message_id text
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.complete_notification_delivery($1,$2,$3,$4)$$;
create function api_v1.service_fail_notification_delivery(
 p_delivery_id uuid,p_lock_token uuid,p_error_code text,p_provider_code text,p_http_status integer
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.fail_notification_delivery($1,$2,$3,$4,$5)$$;
create function api_v1.service_get_notification_dispatch_context(
 p_event_id uuid,p_lock_token uuid
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.get_notification_dispatch_context($1,$2)$$;
create function api_v1.service_skip_notification_delivery(
 p_event_id uuid,p_lock_token uuid,p_channel text,p_template_code text,p_template_version text,p_reason_code text
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.skip_notification_delivery($1,$2,$3,$4,$5,$6)$$;
create function api_v1.service_mark_notification_delivery_ambiguous(
 p_delivery_id uuid,p_lock_token uuid,p_error_code text,p_provider_code text
) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.mark_notification_delivery_ambiguous($1,$2,$3,$4)$$;

alter function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb) owner to qarar_api_executor;
alter function api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer) owner to qarar_api_executor;
alter function api_v1.service_complete_notification_delivery(uuid,uuid,text,text) owner to qarar_api_executor;
alter function api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer) owner to qarar_api_executor;
alter function api_v1.service_get_notification_dispatch_context(uuid,uuid) owner to qarar_api_executor;
alter function api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text) owner to qarar_api_executor;
alter function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) owner to qarar_api_executor;

revoke all on function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer),api_v1.service_complete_notification_delivery(uuid,uuid,text,text),api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer),api_v1.service_get_notification_dispatch_context(uuid,uuid),api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text),api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer),api_v1.service_complete_notification_delivery(uuid,uuid,text,text),api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer),api_v1.service_get_notification_dispatch_context(uuid,uuid),api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text),api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','api_v1',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='api_v1' and p.proname in(
 'service_materialize_notification_delivery','service_claim_notification_deliveries',
 'service_complete_notification_delivery','service_fail_notification_delivery',
 'service_get_notification_dispatch_context','service_skip_notification_delivery',
 'service_mark_notification_delivery_ambiguous'
);
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v1',p.proname,'qarar_governance',replace(p.proname,'service_',''),pg_get_function_identity_arguments(p.oid),'governance','service_role'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='api_v1' and p.proname in(
 'service_materialize_notification_delivery','service_claim_notification_deliveries',
 'service_complete_notification_delivery','service_fail_notification_delivery',
 'service_get_notification_dispatch_context','service_skip_notification_delivery',
 'service_mark_notification_delivery_ambiguous'
);
update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
