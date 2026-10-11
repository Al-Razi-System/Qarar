begin;
-- Classified council review belongs in a meeting. Legacy staff review remains
-- outside the agenda. Existing actor/council/tenant and active-step gates stay.
do $$ declare definition text; marker text;
begin
 definition:=pg_get_functiondef('qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer)'::regprocedure);
 marker:='and s.snapshot->>''responsibility'' in (';
 if position(marker in definition)=0 then raise exception 'Agenda search contract drift'; end if;
 definition:=replace(definition,marker,'and ( (t.topic_type_version_id is not null and s.snapshot->>''responsibility''=''review'') or s.snapshot->>''responsibility'' in (');
 marker:='''final_approve''
            )';
 if position(marker in definition)=0 then raise exception 'Agenda search responsibility contract drift'; end if;
 definition:=replace(definition,marker,'''final_approve''
            ))');
 -- New typed submissions are complete; old or subsequently damaged ones are
 -- not offered. Admission still asserts all requirements in the command/trigger.
 definition:=replace(definition,'and t.current_unit_id = v_m.governance_unit_id','and t.current_unit_id = v_m.governance_unit_id
        and (t.topic_type_version_id is null or (select count(*) from qarar_topics.topic_attachments f where f.topic_id=t.id and f.organization_id=t.organization_id)>=coalesce((t.typed_creation_request#>>''{snapshot,authoring,required_attachment_count}'')::integer,0))');
 execute definition;
 definition:=pg_get_functiondef('qarar_meetings.enforce_governed_agenda_topic()'::regprocedure);
 definition:=replace(definition,'organization_id,governance_source,routing_status,workflow_instance_id,current_workflow_step_id','organization_id,governance_source,routing_status,workflow_instance_id,current_workflow_step_id,topic_type_version_id');
 marker:='if v_step.responsibility not in(';
 if position(marker in definition)=0 then raise exception 'Agenda trigger contract drift'; end if;
 definition:=replace(definition,marker,'if not (v_topic.topic_type_version_id is not null and v_step.responsibility=''review'') and v_step.responsibility not in(');
 execute definition;
 definition:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
 marker:='''scheduled_suggestions'',suggestions';
 if position(marker in definition)=0 then raise exception 'Meeting detail contract drift'; end if;
 definition:=replace(definition,marker,'''scheduled_suggestions'',suggestions,''submitted_suggestions'',case when coalesce((detail#>>''{capabilities,can_manage_agenda}'')::boolean,false) then qarar_meetings.search_eligible_agenda_topics(p_meeting_id,null,100,0) else null end');
 execute definition;
end $$;

create or replace function api_v1.act_topic_workflow_step(p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if qarar_topics.is_typed_topic_v2(p_topic_id) then
  raise exception using errcode='55000',message='تُتخذ قرارات الموضوع المصنف داخل الاجتماع، وليس من صفحة الموضوع';
 end if;
 return qarar_governance.act_topic_workflow_step(p_topic_id,p_outcome_code,p_comment,p_idempotency_key,p_expected_version);
end $$;
-- API owner/grants and registered signatures are unchanged. Meeting-owned
-- internal transitions are unchanged; clients cannot execute implementations.
notify pgrst,'reload schema';
commit;
