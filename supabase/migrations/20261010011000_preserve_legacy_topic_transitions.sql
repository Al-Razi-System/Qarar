begin;
-- Old untyped/in-flight workflows keep their tested compatibility contract.
-- The new typed journey cannot decide or refer outside meeting execution.
create or replace function api_v1.review_topic(p_topic_id uuid,p_action text,p_reason text default null,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_action in ('approve','reject') and exists(select 1 from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id() and topic_type_version_id is not null) then raise exception using errcode='23514',message='قرار القبول أو الرفض يُسجل أثناء مناقشة الموضوع داخل الاجتماع'; end if;
 return qarar_topics.review_topic(p_topic_id,p_action,p_reason,p_expected_updated_at);
end $$;
create or replace function api_v1.refer_topic(p_topic_id uuid,p_to_unit_id uuid,p_reason text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id() and topic_type_version_id is not null) then raise exception using errcode='23514',message='إحالة الموضوع تُسجل أثناء مناقشته داخل الاجتماع'; end if;
 return qarar_topics.refer_topic(p_topic_id,p_to_unit_id,p_reason,p_expected_updated_at);
end $$;
notify pgrst,'reload schema';
commit;
