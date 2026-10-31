-- Read-only enrichment after the existing meeting/tenant authority check.
-- Impact: docs/engineering/impact/MEETING_TOPIC_CONTEXT_20261019_AR.md
begin;
do $enrich$
declare
 definition text := pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
 needle text := 'return detail||jsonb_build_object(';
 addition text := $addition$
 detail := jsonb_set(detail,'{agenda_items}',coalesce((
   select jsonb_agg(jsonb_set(item,'{topic}',(item->'topic')||jsonb_build_object('context',jsonb_build_object(
     'description',t.description,
     'route',coalesce((select jsonb_agg(jsonb_build_object(
       'id',s.id,'name_ar',s.snapshot->>'name_ar','sequence_no',s.sequence_no,
       'unit_name_ar',u.name_ar,'status',s.status,'current',s.id=t.current_workflow_step_id,'acted_at',s.acted_at
     ) order by s.sequence_no) from qarar_governance.workflow_instance_steps s
       left join qarar_core.governance_units u on u.id=s.assigned_unit_id and u.organization_id=t.organization_id
       where s.workflow_instance_id=t.workflow_instance_id and s.organization_id=t.organization_id),'[]'::jsonb),
     'previous_decisions',coalesce((select jsonb_agg(jsonb_build_object(
       'id',d.id,'decision_no',d.decision_no,'decision_text',d.decision_text,
       'meeting_title_ar',m.title_ar,'meeting_no',m.meeting_no,'meeting_date',m.scheduled_date,'unit_name_ar',u.name_ar
     ) order by m.scheduled_date,d.created_at)
       from qarar_decisions.decisions d
       join qarar_meetings.meetings m on m.id=d.meeting_id and m.organization_id=t.organization_id
       left join qarar_core.governance_units u on u.id=m.governance_unit_id and u.organization_id=t.organization_id
       where d.topic_id=t.id and d.organization_id=t.organization_id
         and m.id<>p_meeting_id and m.status in ('closed','archived')),'[]'::jsonb)
   ))) order by (item->>'agenda_order')::integer)
   from jsonb_array_elements(detail->'agenda_items') item
   join qarar_topics.topics t on t.id=(item#>>'{topic,id}')::uuid and t.organization_id=qarar_iam.current_organization_id()
 ),'[]'::jsonb));
 $addition$;
begin
 if position('''previous_decisions''' in definition)>0
    or (length(definition)-length(replace(definition,needle,''))) <> length(needle) then
   raise exception 'Unexpected meeting detail source; refusing context enrichment';
 end if;
 execute replace(definition,needle,addition||needle);
end $enrich$;
notify pgrst,'reload schema';
commit;
