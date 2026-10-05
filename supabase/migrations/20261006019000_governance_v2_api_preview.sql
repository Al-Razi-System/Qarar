begin;

create schema if not exists api_v2 authorization qarar_api_executor;
revoke all on schema api_v2 from public,anon,authenticated,service_role;
grant usage on schema api_v2 to qarar_api_executor;

create or replace function api_v2.governance_error_envelope(
  p_sqlstate text,p_message text,p_trace_id uuid
) returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare v_code text;v_copy text;
begin
  if p_sqlstate='P0002' then v_code:='MODEL_BUNDLE_NOT_FOUND';v_copy:='تعذر العثور على حزمة الحوكمة المطلوبة.';
  elsif p_sqlstate='40001' then v_code:='MODEL_VERSION_CONFLICT';v_copy:='تم تعديل الحزمة في جلسة أخرى. حدّث البيانات ثم أعد المحاولة.';
  elsif p_sqlstate='23P01' then v_code:='MODEL_EFFECTIVE_OVERLAP';v_copy:='توجد نسخة فعالة متداخلة للفترة المحددة.';
  elsif p_sqlstate='42501' and p_message like 'لا يجوز لمعد الحزمة%' then v_code:='MODEL_REVIEW_SEPARATION_REQUIRED';v_copy:='لا يجوز لمن أعد الحزمة اعتمادها بنفسه.';
  elsif p_sqlstate='42501' then v_code:='MODEL_PERMISSION_DENIED';v_copy:='لا تملك الصلاحية المطلوبة لهذه العملية في هذا النطاق.';
  elsif p_sqlstate='23514' and p_message like 'لا يمكن التفعيل%' then v_code:='MODEL_ACTIVATION_BLOCKED';v_copy:='لا يمكن التفعيل قبل معالجة جميع الموانع.';
  elsif p_sqlstate='23514' then v_code:='MODEL_VALIDATION_FAILED';v_copy:='أكمل المتطلبات الموضحة قبل إرسال الحزمة.';
  elsif p_sqlstate='22023' then v_code:='MODEL_VALIDATION_FAILED';v_copy:='تحقق من الحقول المطلوبة والقيم المدخلة.';
  elsif p_sqlstate='55000' then v_code:='MODEL_BUNDLE_NOT_EDITABLE';v_copy:='لا يمكن تنفيذ الإجراء في الحالة الحالية للحزمة.';
  else v_code:='MODEL_SERVER_FAILURE';v_copy:='تعذر إتمام العملية حالياً. استخدم رقم التتبع عند التواصل مع الدعم.';
  end if;
  return jsonb_build_object('ok',false,'error_code',v_code,'message_ar',v_copy,
    'field_errors','[]'::jsonb,'trace_id',p_trace_id);
end;
$$;

create or replace function api_v2.save_governance_bundle_draft_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.save_governance_bundle_draft_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle);
 return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
 return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.validate_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.validate_governance_bundle_v2(p_bundle_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.submit_governance_bundle_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.submit_governance_bundle_v2(p_bundle_id,p_expected_lock_version,p_client_request_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.request_governance_bundle_changes_v2(p_bundle_id uuid,p_expected_lock_version integer,p_review_comment text,p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.request_governance_bundle_changes_v2(p_bundle_id,p_expected_lock_version,p_review_comment,p_client_request_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.approve_governance_bundle_v2(p_bundle_id uuid,p_expected_lock_version integer,p_review_comment text,p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.approve_governance_bundle_v2(p_bundle_id,p_expected_lock_version,p_review_comment,p_client_request_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.activate_governance_bundle_v2(p_bundle_id uuid,p_expected_lock_version integer,p_effective_from date,p_client_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.activate_governance_bundle_v2(p_bundle_id,p_expected_lock_version,p_effective_from,p_client_request_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.get_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.get_governance_bundle_v2(p_bundle_id);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.list_effective_topic_types_v2(p_origin_governance_unit_id uuid,p_effective_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.list_effective_topic_types_v2(p_origin_governance_unit_id,p_effective_on);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

create or replace function api_v2.preview_topic_route_v2(p_topic_type_version_id uuid,p_origin_governance_unit_id uuid,p_effective_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_trace uuid:=gen_random_uuid();v_data jsonb;v_state text;v_message text;
begin v_data:=qarar_governance.preview_topic_route_v2(p_topic_type_version_id,p_origin_governance_unit_id,p_effective_on);return jsonb_build_object('ok',true,'data',v_data,'trace_id',v_trace);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;return api_v2.governance_error_envelope(v_state,v_message,v_trace);end;$$;

grant execute on function
  qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb),qarar_governance.validate_governance_bundle_v2(uuid),
  qarar_governance.submit_governance_bundle_v2(uuid,integer,uuid),qarar_governance.request_governance_bundle_changes_v2(uuid,integer,text,uuid),
  qarar_governance.approve_governance_bundle_v2(uuid,integer,text,uuid),qarar_governance.activate_governance_bundle_v2(uuid,integer,date,uuid),
  qarar_governance.get_governance_bundle_v2(uuid),qarar_governance.list_effective_topic_types_v2(uuid,date),
  qarar_governance.preview_topic_route_v2(uuid,uuid,date)
to qarar_api_executor;

alter function api_v2.governance_error_envelope(text,text,uuid) owner to qarar_api_executor;
alter function api_v2.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) owner to qarar_api_executor;
alter function api_v2.validate_governance_bundle_v2(uuid) owner to qarar_api_executor;
alter function api_v2.submit_governance_bundle_v2(uuid,integer,uuid) owner to qarar_api_executor;
alter function api_v2.request_governance_bundle_changes_v2(uuid,integer,text,uuid) owner to qarar_api_executor;
alter function api_v2.approve_governance_bundle_v2(uuid,integer,text,uuid) owner to qarar_api_executor;
alter function api_v2.activate_governance_bundle_v2(uuid,integer,date,uuid) owner to qarar_api_executor;
alter function api_v2.get_governance_bundle_v2(uuid) owner to qarar_api_executor;
alter function api_v2.list_effective_topic_types_v2(uuid,date) owner to qarar_api_executor;
alter function api_v2.preview_topic_route_v2(uuid,uuid,date) owner to qarar_api_executor;

revoke all on all functions in schema api_v2 from public,anon,authenticated,service_role;
grant execute on all functions in schema api_v2 to qarar_api_executor;

commit;
