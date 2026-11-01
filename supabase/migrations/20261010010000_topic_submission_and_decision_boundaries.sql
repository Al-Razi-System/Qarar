begin;
alter function api_v2.create_topic_from_type_v2(text,text,uuid,uuid,uuid) rename to create_topic_from_type_before_preparation_v2;
revoke all on function api_v2.create_topic_from_type_before_preparation_v2(text,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function api_v2.create_topic_from_type_v2(p_title_ar text,p_description text,p_topic_type_version_id uuid,p_current_unit_id uuid,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); state text; message text;
begin
 perform qarar_iam.assert_permission('topics.create',p_current_unit_id);
 if not exists(select 1 from qarar_topics.topics where organization_id=qarar_iam.current_organization_id() and submitted_by_user_id=auth.uid() and client_request_id=p_client_request_id) then raise exception using errcode='23514',message='جهّز الطلب ومرفقاته ثم قدّمه من واجهة تقديم الموضوع'; end if;
 return api_v2.create_topic_from_type_before_preparation_v2(p_title_ar,p_description,p_topic_type_version_id,p_current_unit_id,p_client_request_id);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace);
end $$;
alter function api_v2.create_topic_from_type_v2(text,text,uuid,uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v2.create_topic_from_type_v2(text,text,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function api_v2.create_topic_from_type_v2(text,text,uuid,uuid,uuid) to authenticated;
-- Meeting execution still calls the private contextual transition, not these
-- general public topic commands. Existing requests remain replayable above.
create or replace function api_v1.review_topic(p_topic_id uuid,p_action text,p_reason text default null,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_action in ('approve','reject') then raise exception using errcode='23514',message='قرار القبول أو الرفض يُسجل أثناء مناقشة الموضوع داخل الاجتماع'; end if;
 return qarar_topics.review_topic(p_topic_id,p_action,p_reason,p_expected_updated_at);
end $$;
create or replace function api_v1.refer_topic(p_topic_id uuid,p_to_unit_id uuid,p_reason text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 raise exception using errcode='23514',message='إحالة الموضوع تُسجل أثناء مناقشته داخل الاجتماع';
end $$;
notify pgrst,'reload schema';
commit;
