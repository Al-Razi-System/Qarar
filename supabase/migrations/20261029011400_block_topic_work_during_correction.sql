-- A topic under formal correction cannot enter another agenda or voting round.
begin;
create function qarar_governance.assert_topic_not_under_correction(p_topic_id uuid,p_organization_id uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog
as $$
begin
  if exists(select 1 from qarar_governance.topic_correction_requests r
    where r.topic_id=p_topic_id and r.organization_id=p_organization_id
      and r.status in('traversing','returned_to_opener')) then
    raise exception using errcode='55000',message='الموضوع قيد تصحيح رسمي؛ لا يمكن إدراجه أو التصويت عليه حتى يكتمل الطلب أو يُسحب.';
  end if;
end;
$$;
alter function qarar_governance.assert_topic_not_under_correction(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.assert_topic_not_under_correction(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.assert_topic_not_under_correction(uuid,uuid) to qarar_meetings_executor,qarar_voting_executor;

create function qarar_governance.guard_agenda_topic_correction()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$begin perform qarar_governance.assert_topic_not_under_correction(new.topic_id,new.organization_id);return new;end$$;
alter function qarar_governance.guard_agenda_topic_correction() owner to qarar_governance_executor;
create trigger block_agenda_while_topic_correction before insert or update of topic_id
on qarar_meetings.agenda_items for each row execute function qarar_governance.guard_agenda_topic_correction();

create function qarar_governance.guard_vote_topic_correction()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_topic uuid;
begin
  select topic_id into v_topic from qarar_meetings.agenda_items where id=new.agenda_item_id and organization_id=new.organization_id;
  if v_topic is not null then perform qarar_governance.assert_topic_not_under_correction(v_topic,new.organization_id);end if;
  return new;
end;
$$;
alter function qarar_governance.guard_vote_topic_correction() owner to qarar_governance_executor;
create trigger block_vote_while_topic_correction before insert
on qarar_voting.voting_rounds for each row execute function qarar_governance.guard_vote_topic_correction();

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in('qarar_governance.assert_topic_not_under_correction(uuid,uuid)'::regprocedure,'qarar_governance.guard_agenda_topic_correction()'::regprocedure,'qarar_governance.guard_vote_topic_correction()'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('governance','qarar_meetings','agenda_items','Resolve the topic before enforcing the correction voting guard')
on conflict do nothing;
notify pgrst,'reload schema';
commit;
