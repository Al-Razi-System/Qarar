begin;
-- Explicit authoring scope decides availability. Legacy route-only scope retains
-- its initial-step restriction. Do not widen user contextual permissions.
do $$ declare name text; definition text; old_fragment text; new_fragment text;
begin
 foreach name in array array['list_effective_topic_types_route_v2(uuid,date)','preview_topic_route_order_v2(uuid,uuid,date)'] loop
  definition:=pg_get_functiondef(('qarar_governance.'||name)::regprocedure);
  old_fragment:='and s.is_initial';
  new_fragment:='and (s.is_initial or exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 profile where profile.organization_id=v_org and profile.topic_type_version_id='||case when name like 'list%' then 'v.id' else 'v_version.id' end||' and profile.scope_kind<>''route'' and qarar_governance.topic_type_origin_allowed_v2(profile.topic_type_version_id,p_origin_governance_unit_id)))';
  if position(old_fragment in definition)=0 then raise exception 'Scope contract drift: %',name; end if;
  definition:=replace(definition,old_fragment,new_fragment);
  -- The resolved unit equality belongs to the legacy initial-step branch only.
  old_fragment:='and qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id)=p_origin_governance_unit_id';
  new_fragment:='and (qarar_governance.resolve_step_unit(v_org,p_origin_governance_unit_id,s.governance_unit_id,s.governance_class_id)=p_origin_governance_unit_id or exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 profile where profile.organization_id=v_org and profile.topic_type_version_id='||case when name like 'list%' then 'v.id' else 'v_version.id' end||' and profile.scope_kind<>''route'' and qarar_governance.topic_type_origin_allowed_v2(profile.topic_type_version_id,p_origin_governance_unit_id)))';
  if position(old_fragment in definition)=0 then raise exception 'Resolution contract drift: %',name; end if;
  execute replace(definition,old_fragment,new_fragment);
 end loop;
 -- New topics must be assigned to their first workflow council, not the council
 -- used to discover the classification. The original origin remains immutable.
 definition:=pg_get_functiondef('qarar_governance.attach_typed_topic_workflow_v2(uuid)'::regprocedure);
 old_fragment:='perform qarar_topics.apply_governance_snapshot';
 if position(old_fragment in definition)=0 then raise exception 'Workflow contract drift'; end if;
 execute replace(definition,old_fragment,'update qarar_topics.topics set current_unit_id=(select assigned_unit_id from qarar_governance.workflow_instance_steps where id=first_step) where id=t.id and organization_id=o; '||old_fragment);
end $$;
notify pgrst,'reload schema';
commit;
