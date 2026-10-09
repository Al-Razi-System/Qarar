begin;
-- Server logs retain the internal cause; API envelopes keep safe Arabic copy.
create or replace function api_v2.manage_topic_type_v2(p_bundle_id uuid,p_action text,p_expected_lock_version integer,p_client_request_id uuid,p_comment text default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin
 result:=qarar_governance.manage_topic_type_v2(p_bundle_id,p_action,p_expected_lock_version,p_client_request_id,p_comment);
 return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text;
 raise log 'Qarar type command trace=% sqlstate=% cause=%',trace,state,message;
 return api_v2.governance_error_envelope(state,message,trace);
end $$;
create or replace function api_v2.prepare_typed_topic_v2(p_version_id uuid,p_unit_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin result:=qarar_governance.prepare_typed_topic_v2(p_version_id,p_unit_id); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; raise log 'Qarar type command trace=% sqlstate=% cause=%',trace,state,message;
 return api_v2.governance_error_envelope(state,message,trace); end $$;
create or replace function api_v2.create_topic_from_type_v2(p_title_ar text,p_description text,p_topic_type_version_id uuid,p_current_unit_id uuid,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text;
begin result:=qarar_topics.create_topic_from_type_v2(p_title_ar,p_description,p_topic_type_version_id,p_current_unit_id,p_client_request_id); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; raise log 'Qarar type command trace=% sqlstate=% cause=%',trace,state,message;
 return api_v2.governance_error_envelope(state,message,trace); end $$;

notify pgrst,'reload schema';
commit;

