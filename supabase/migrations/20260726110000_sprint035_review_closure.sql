begin;

alter table qarar_governance.workflow_instance_steps
  add column if not exists action_idempotency_key uuid,
  add column if not exists action_version integer not null default 0;
create unique index if not exists workflow_step_action_idempotency_uidx
  on qarar_governance.workflow_instance_steps(workflow_instance_id,action_idempotency_key)
  where action_idempotency_key is not null;

create or replace function qarar_governance.conditions_match(p_conditions jsonb,p_context jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare k text;v jsonb;
begin
  if p_conditions is null or p_conditions='{}'::jsonb then return true;end if;
  if jsonb_typeof(p_conditions)<>'object' then return false;end if;
  for k,v in select * from jsonb_each(p_conditions) loop
    if k='all' then
      if not (select bool_and(qarar_governance.conditions_match(x,p_context))
              from jsonb_array_elements(v)x) then return false;end if;
    elsif k='any' then
      if not (select bool_or(qarar_governance.conditions_match(x,p_context))
              from jsonb_array_elements(v)x) then return false;end if;
    elsif k='not' then
      if qarar_governance.conditions_match(v,p_context) then return false;end if;
    elsif p_context->k is distinct from v then return false;
    end if;
  end loop;
  return true;
end $$;

create or replace function qarar_governance.validate_workflow_template_version(p_workflow_template_version_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,qarar_governance as $$
declare e jsonb:='[]';initial_id uuid;
begin
 select id into initial_id from qarar_governance.workflow_template_steps
 where workflow_template_version_id=p_workflow_template_version_id and is_initial;
 if (select count(*) from qarar_governance.workflow_template_steps where workflow_template_version_id=p_workflow_template_version_id and is_initial)<>1
 then e:=e||jsonb_build_array('يجب تحديد خطوة بداية واحدة');end if;
 if not exists(select 1 from qarar_governance.workflow_template_steps where workflow_template_version_id=p_workflow_template_version_id and is_terminal)
 then e:=e||jsonb_build_array('يجب تحديد خطوة نهائية');end if;
 if initial_id is not null and exists(
   with recursive r(id) as(select initial_id union select t.to_step_id from r join qarar_governance.workflow_template_transitions t on t.from_step_id=r.id where t.to_step_id is not null)
   select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=p_workflow_template_version_id and not exists(select 1 from r where r.id=s.id)
 ) then e:=e||jsonb_build_array('توجد خطوات معزولة لا يمكن الوصول إليها');end if;
 if initial_id is not null and exists(
   with recursive terminal_reachable(id) as(
    select id from qarar_governance.workflow_template_steps where workflow_template_version_id=p_workflow_template_version_id and is_terminal
    union select t.from_step_id from terminal_reachable r join qarar_governance.workflow_template_transitions t on t.to_step_id=r.id)
   select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=p_workflow_template_version_id and not exists(select 1 from terminal_reachable r where r.id=s.id)
 ) then e:=e||jsonb_build_array('توجد فروع لا تصل إلى نهاية');end if;
 if not coalesce((select allow_cycles from qarar_governance.workflow_template_versions
                   where id=p_workflow_template_version_id),false) and exists(
   with recursive walk(id,path,cycle) as(
    select initial_id,array[initial_id],false
    union all
    select t.to_step_id,w.path||t.to_step_id,t.to_step_id=any(w.path)
    from walk w join qarar_governance.workflow_template_transitions t on t.from_step_id=w.id
    where t.to_step_id is not null and not w.cycle)
   select 1 from walk where cycle
 ) then e:=e||jsonb_build_array('المسار يحتوي دورة غير مصرح بها');end if;
 if exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=p_workflow_template_version_id
   and not s.is_terminal and exists(select 1 from unnest(s.allowed_outcomes)o where not exists(
    select 1 from qarar_governance.workflow_template_transitions t where t.from_step_id=s.id and t.outcome_code=o)))
 then e:=e||jsonb_build_array('توجد نتيجة دون انتقال');end if;
 update qarar_governance.workflow_template_versions set validation_status=case when e='[]' then 'valid' else 'invalid' end,validation_errors=e where id=p_workflow_template_version_id;
 return jsonb_build_object('valid',e='[]','errors',e);
end $$;

create or replace function qarar_governance.get_topic_workflow(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();u uuid;result jsonb;
begin
 select current_unit_id into u from qarar_topics.topics where id=p_topic_id and organization_id=o;
 if u is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
 perform qarar_iam.assert_permission('topics.read',u);
 select jsonb_build_object('instance_id',i.id,'status',i.status,'current_step_id',i.current_step_id,
  'steps',coalesce(jsonb_agg(to_jsonb(s) order by s.sequence_no),'[]')) into result
 from qarar_governance.workflow_instances i left join qarar_governance.workflow_instance_steps s on s.workflow_instance_id=i.id
 where i.topic_id=p_topic_id and i.organization_id=o group by i.id;
 return coalesce(result,jsonb_build_object('topic_id',p_topic_id,'status','not_started','steps','[]'));
end $$;

create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null,
 p_idempotency_key uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();i record;s record;t record;ts record;n uuid;st text;source text;ctx jsonb;
begin
 if p_idempotency_key is null then
  raise exception using errcode='22023',message='idempotency_key مطلوب';
 end if;
 select wi.* into i from qarar_governance.workflow_instances wi
 join qarar_governance.workflow_instance_steps replay on replay.workflow_instance_id=wi.id
 where wi.topic_id=p_topic_id and wi.organization_id=o
  and replay.action_idempotency_key=p_idempotency_key;
 if i.id is not null then
  select * into s from qarar_governance.workflow_instance_steps
  where workflow_instance_id=i.id and action_idempotency_key=p_idempotency_key;
  return jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',i.id,
   'completed_step_id',s.id,'outcome',s.outcome_code,'workflow_status',i.status,
   'version',s.action_version,'idempotent_replay',true);
 end if;
 select * into i from qarar_governance.workflow_instances where topic_id=p_topic_id and organization_id=o and status='active' for update;
 if i.id is null then raise exception using errcode='55000',message='لا يوجد مسار نشط';end if;
 select * into s from qarar_governance.workflow_instance_steps where id=i.current_step_id for update;
 if s.status<>'active' then raise exception using errcode='55000',message='لا توجد خطوة نشطة';end if;
 if p_expected_version is null or p_expected_version<>s.action_version then raise exception using errcode='40001',message='تم تعديل الخطوة؛ حدّث البيانات';end if;
 perform qarar_iam.assert_permission(coalesce(s.required_permission_code,'topics.review'),s.assigned_unit_id);
 select * into ts from qarar_governance.workflow_template_steps where id=s.template_step_id;
 ctx:=jsonb_build_object('outcome',p_outcome_code,'assigned_unit_id',s.assigned_unit_id,'topic_id',p_topic_id);
 if not qarar_governance.conditions_match(ts.entry_conditions,ctx) then raise exception using errcode='55000',message='شروط دخول الخطوة غير متحققة';end if;
 if not qarar_governance.conditions_match(ts.exit_conditions,ctx) then raise exception using errcode='55000',message='شروط إكمال الخطوة غير متحققة';end if;
 if ts.step_type='voting' and current_setting('qarar.voting_transition',true)<>'on'
 then raise exception using errcode='55000',message='الخطوة التصويتية تُحسم من نتيجة التصويت فقط';end if;
 select * into t from qarar_governance.workflow_template_transitions where workflow_template_version_id=i.workflow_template_version_id and from_step_id=s.template_step_id and outcome_code=p_outcome_code;
 if t.id is null and not(ts.is_terminal and p_outcome_code=any(ts.allowed_outcomes))
 then raise exception using errcode='22023',message='لا يوجد انتقال صالح لهذه النتيجة';end if;
 if t.id is not null and not qarar_governance.conditions_match(t.conditions,ctx)
 then raise exception using errcode='22023',message='شروط الانتقال غير متحققة';end if;
 update qarar_governance.workflow_instance_steps set status=case when p_outcome_code='rejected' then 'rejected' else 'completed' end,
  acted_by_user_id=actor,acted_at=now(),outcome_code=p_outcome_code,comment=p_comment,
  action_idempotency_key=p_idempotency_key,action_version=action_version+1 where id=s.id;
 if t.to_step_id is not null then
  select id into n from qarar_governance.workflow_instance_steps where workflow_instance_id=i.id and template_step_id=t.to_step_id;
  update qarar_governance.workflow_instance_steps set status='active',opened_at=now() where id=n;
  update qarar_governance.workflow_instances set current_step_id=n where id=i.id;st:='active';
 else st:=case when p_outcome_code='rejected' then 'rejected' else 'completed' end;
  update qarar_governance.workflow_instances set status=st,current_step_id=null,completed_at=now() where id=i.id;
 end if;
 select governance_source into source from qarar_topics.topics where id=p_topic_id;
 perform qarar_topics.apply_governance_snapshot(p_topic_id,source,'routing_ready',
  (select policy_id from qarar_topics.topics where id=p_topic_id),(select policy_version_id from qarar_topics.topics where id=p_topic_id),
  (select policy_item_id from qarar_topics.topics where id=p_topic_id),(select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id),
  i.workflow_template_version_id,i.id,n,(select routing_decision_id from qarar_topics.topics where id=p_topic_id));
 return jsonb_build_object('topic_id',p_topic_id,'completed_step_id',s.id,'next_step_id',n,'workflow_status',st,'version',s.action_version+1);
end $$;

create or replace function qarar_voting.advance_governed_workflow_from_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_voting as $$
declare topic_id uuid;v integer;
begin
 if new.status='closed' and new.result is not null and old.status is distinct from 'closed' then
 select a.topic_id into topic_id from qarar_meetings.agenda_items a where a.id=new.agenda_item_id;
  select action_version into v from qarar_governance.workflow_instance_steps s join qarar_topics.topics t on t.current_workflow_step_id=s.id where t.id=topic_id;
  if v is null then return new;end if;
  perform set_config('qarar.voting_transition','on',true);
  perform qarar_governance.act_topic_workflow_step(topic_id,case new.result when 'approved' then 'approved' when 'rejected' then 'rejected' when 'tied' then 'tie' else 'no_vote' end,
    'نتيجة التصويت '||new.id,new.id,v);
 end if;return new;
end $$;
drop trigger if exists voting_round_advance_workflow on qarar_voting.voting_rounds;
create trigger voting_round_advance_workflow after update of status,result on qarar_voting.voting_rounds
for each row execute function qarar_voting.advance_governed_workflow_from_vote();

create or replace function qarar_iam.provision_governance_permissions()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_iam as $$
begin
 insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,
  name_ar,name_en,description,is_system_permission,is_active
 )
 select new.id,p.code,'governance',p.action,p.context_scope,
  p.name_ar,p.name_en,p.description,true,true
 from (values
  ('governance.policies.read','read','organization','عرض اللوائح','Read regulations','View regulations, versions, items, and scopes'),
  ('governance.policies.manage','manage','organization','إدارة اللوائح','Manage regulations','Create and edit regulation drafts and mappings'),
  ('governance.policies.approve','approve','organization','اعتماد اللوائح','Approve regulations','Review, approve, activate, suspend, and archive versions'),
  ('governance.workflows.manage','manage','organization','إدارة المسارات الحوكمية','Manage governed workflows','Configure governed workflow templates and transitions'),
  ('governance.exceptions.request','request','governance_unit','طلب استثناء لائحي','Request regulation exception','Request a governed temporary or exceptional route'),
  ('governance.exceptions.approve','approve','organization','اعتماد الاستثناءات اللائحية','Approve regulation exceptions','Independently approve or reject governed exceptions'),
  ('governance.compliance.read','read','organization','عرض الامتثال اللائحي','Read regulation compliance','View regulation traceability and coverage reporting'),
  ('governance.alerts.manage','manage','organization','إدارة تنبيهات الحوكمة','Manage governance alerts','Review and resolve governance coverage and routing alerts')
 ) as p(code,action,context_scope,name_ar,name_en,description)
 on conflict(organization_id,code) do nothing;
 return new;
end $$;
revoke all on function qarar_iam.provision_governance_permissions() from public;
revoke all on function qarar_iam.provision_governance_permissions() from anon,authenticated,service_role;
alter function qarar_iam.provision_governance_permissions() owner to qarar_iam_executor;

drop trigger if exists provision_governance_permissions on qarar_core.organizations;
create trigger provision_governance_permissions
after insert on qarar_core.organizations
for each row execute function qarar_iam.provision_governance_permissions();

insert into qarar_iam.permissions(
 organization_id,code,module,action,context_scope,
 name_ar,name_en,description,is_system_permission,is_active
)
select o.id,p.code,'governance',p.action,p.context_scope,
 p.name_ar,p.name_en,p.description,true,true
from qarar_core.organizations o
cross join (values
 ('governance.policies.read','read','organization','عرض اللوائح','Read regulations','View regulations, versions, items, and scopes'),
 ('governance.policies.manage','manage','organization','إدارة اللوائح','Manage regulations','Create and edit regulation drafts and mappings'),
 ('governance.policies.approve','approve','organization','اعتماد اللوائح','Approve regulations','Review, approve, activate, suspend, and archive versions'),
 ('governance.workflows.manage','manage','organization','إدارة المسارات الحوكمية','Manage governed workflows','Configure governed workflow templates and transitions'),
 ('governance.exceptions.request','request','governance_unit','طلب استثناء لائحي','Request regulation exception','Request a governed temporary or exceptional route'),
 ('governance.exceptions.approve','approve','organization','اعتماد الاستثناءات اللائحية','Approve regulation exceptions','Independently approve or reject governed exceptions'),
 ('governance.compliance.read','read','organization','عرض الامتثال اللائحي','Read regulation compliance','View regulation traceability and coverage reporting'),
 ('governance.alerts.manage','manage','organization','إدارة تنبيهات الحوكمة','Manage governance alerts','Review and resolve governance coverage and routing alerts')
) as p(code,action,context_scope,name_ar,name_en,description)
on conflict(organization_id,code) do nothing;

alter function qarar_governance.conditions_match(jsonb,jsonb) owner to qarar_governance_executor;
alter function qarar_governance.validate_workflow_template_version(uuid) owner to qarar_governance_executor;
alter function qarar_governance.get_topic_workflow(uuid) owner to qarar_governance_executor;
alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function qarar_voting.advance_governed_workflow_from_vote() from public;
revoke all on function qarar_voting.advance_governed_workflow_from_vote() from anon,authenticated,service_role;
alter function qarar_voting.advance_governed_workflow_from_vote() owner to qarar_voting_executor;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'voting','qarar_voting',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_voting' and p.proname='advance_governed_workflow_from_vote'
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,module_code='voting',owning_schema='qarar_voting';
insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam' and p.proname='provision_governance_permissions'
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,module_code='iam',owning_schema='qarar_iam';
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values
 ('voting','qarar_governance','workflow_instance_steps','Resolve the active governed step after a vote closes'),
 ('voting','qarar_topics','topics','Resolve the governed topic attached to a closed vote')
on conflict do nothing;
grant usage on schema qarar_governance,qarar_topics to qarar_voting_executor;
grant select on qarar_governance.workflow_instance_steps,qarar_topics.topics to qarar_voting_executor;
insert into qarar_architecture.module_function_execute_allowlist(
 source_module,target_schema,function_name,identity_arguments,rationale
)values('voting','qarar_governance','act_topic_workflow_step',
 'p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer',
 'Advance a governed voting step from the authoritative closed result')
on conflict do nothing;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
 to qarar_voting_executor;

commit;
