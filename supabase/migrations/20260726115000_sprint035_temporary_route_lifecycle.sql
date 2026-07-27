begin;

alter table qarar_topics.topics drop constraint if exists topics_routing_status_check;
alter table qarar_topics.topics add constraint topics_routing_status_check check (routing_status in(
  'routing_pending','routing_resolved','routing_conflict','routing_blocked',
  'routing_exception_pending','routing_ready','routing_expired'
));
alter table qarar_governance.topic_governance_mappings
  drop constraint if exists topic_governance_mappings_routing_status_check;
alter table qarar_governance.topic_governance_mappings
  add constraint topic_governance_mappings_routing_status_check check (routing_status in(
    'routing_pending','routing_resolved','routing_conflict','routing_blocked',
    'routing_exception_pending','routing_ready','routing_expired'
  ));
alter table qarar_governance.workflow_instances
  drop constraint if exists workflow_instances_status_check;
alter table qarar_governance.workflow_instances
  add constraint workflow_instances_status_check check (status in(
    'active','completed','rejected','cancelled','blocked','expired'
  ));
alter table qarar_governance.governance_exceptions
  drop constraint if exists governance_exceptions_check1;
alter table qarar_governance.governance_exceptions
  add constraint governance_exceptions_review_check check (
    status in('pending','expired')
    or (reviewed_by_user_id is not null and reviewed_at is not null)
  );

create or replace function qarar_governance.validate_workflow_template_version(
  p_workflow_template_version_id uuid
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,qarar_governance
as $$
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
 ) then e:=e||jsonb_build_array('توجد خطوة معزولة عن بداية المسار');end if;
 if initial_id is not null and exists(
   with recursive terminal_reachable(id) as(
    select id from qarar_governance.workflow_template_steps where workflow_template_version_id=p_workflow_template_version_id and is_terminal
    union select t.from_step_id from terminal_reachable r join qarar_governance.workflow_template_transitions t on t.to_step_id=r.id)
   select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=p_workflow_template_version_id and not exists(select 1 from terminal_reachable r where r.id=s.id)
 ) then e:=e||jsonb_build_array('توجد خطوة لا تصل إلى نهاية');end if;
 if not coalesce((select allow_cycles from qarar_governance.workflow_template_versions where id=p_workflow_template_version_id),false) and exists(
   with recursive walk(id,path,cycle) as(
    select initial_id,array[initial_id],false union all
    select t.to_step_id,w.path||t.to_step_id,t.to_step_id=any(w.path)
    from walk w join qarar_governance.workflow_template_transitions t on t.from_step_id=w.id
    where t.to_step_id is not null and not w.cycle)
   select 1 from walk where cycle
 ) then e:=e||jsonb_build_array('المسار يحتوي دورة غير مصرح بها');end if;
 if exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=p_workflow_template_version_id
   and not s.is_terminal and exists(select 1 from unnest(s.allowed_outcomes)o where not exists(
    select 1 from qarar_governance.workflow_template_transitions t where t.from_step_id=s.id and t.outcome_code=o)))
 then e:=e||jsonb_build_array('توجد نتيجة دون انتقال');end if;
 if exists(select 1 from qarar_governance.workflow_template_steps s
   where s.workflow_template_version_id=p_workflow_template_version_id and s.step_type='voting'
     and (s.allowed_outcomes is distinct from array['approved','rejected','tie','no_vote']::text[]))
 then e:=e||jsonb_build_array('خطوة التصويت يجب أن تعالج approved و rejected و tie و no_vote فقط');end if;
 update qarar_governance.workflow_template_versions set validation_status=case when e='[]' then 'valid' else 'invalid' end,validation_errors=e where id=p_workflow_template_version_id;
 return jsonb_build_object('valid',e='[]','errors',e);
end $$;

create or replace function qarar_governance.expire_governance_exceptions(
  p_as_of timestamptz default now()
) returns integer language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_exception record;v_count integer:=0;v_step_id uuid;
begin
 for v_exception in
   update qarar_governance.governance_exceptions
   set status='expired'
   where status in('pending','approved') and valid_until<=p_as_of
   returning id,organization_id,topic_id,status,requested_source
 loop
   select current_step_id into v_step_id from qarar_governance.workflow_instances
   where topic_id=v_exception.topic_id and organization_id=v_exception.organization_id
     and status='active' for update;
   if v_step_id is not null then
     update qarar_governance.workflow_instance_steps set status='cancelled',comment='temporary route expired'
     where id=v_step_id and status='active';
     update qarar_governance.workflow_instances set status='expired',current_step_id=null,
       completed_at=p_as_of,snapshot=snapshot||jsonb_build_object('expired_at',p_as_of,'expired_step_id',v_step_id)
     where topic_id=v_exception.topic_id and organization_id=v_exception.organization_id and status='active';
   end if;
   perform qarar_topics.apply_governance_snapshot(
     v_exception.topic_id,v_exception.requested_source,'routing_expired',
     (select policy_id from qarar_topics.topics where id=v_exception.topic_id),
     (select policy_version_id from qarar_topics.topics where id=v_exception.topic_id),
     (select policy_item_id from qarar_topics.topics where id=v_exception.topic_id),
     (select policy_scope_assignment_id from qarar_topics.topics where id=v_exception.topic_id),
     (select workflow_template_version_id from qarar_governance.workflow_instances where topic_id=v_exception.topic_id order by started_at desc limit 1),
     (select id from qarar_governance.workflow_instances where topic_id=v_exception.topic_id order by started_at desc limit 1),
     null,
     (select routing_decision_id from qarar_topics.topics where id=v_exception.topic_id)
   );
   perform qarar_audit.append_audit_log(v_exception.organization_id,'governance.exception.expire',
     'governance_exceptions',v_exception.id,jsonb_build_object('topic_id',v_exception.topic_id));
   v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function qarar_governance.request_custom_workflow(
  p_topic_id uuid,p_workflow_template_version_id uuid,p_reason text,p_valid_until timestamptz default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();unit_id uuid;route_status text;source text;exception_id uuid;
begin
 select current_unit_id,routing_status,governance_source into unit_id,route_status,source
 from qarar_topics.topics where id=p_topic_id and organization_id=o;
 if source<>'custom' or route_status not in('routing_exception_pending','routing_expired') then raise exception using errcode='55000',message='الموضوع لا ينتظر مساراً مخصصاً أو تجديداً له';end if;
 perform qarar_iam.assert_permission('governance.exceptions.request',unit_id);
 if char_length(btrim(coalesce(p_reason,'')))<10 then raise exception using errcode='22023',message='يلزم سبب تفصيلي';end if;
 if p_valid_until is null or p_valid_until<=now() then raise exception using errcode='22023',message='يلزم تاريخ انتهاء مستقبلي';end if;
 if not exists(select 1 from qarar_governance.workflow_template_versions where id=p_workflow_template_version_id and organization_id=o and status='active' and validation_status='valid') then raise exception using errcode='23514',message='قالب المسار غير صالح';end if;
 insert into qarar_governance.governance_exceptions(organization_id,topic_id,requested_source,requested_route,reason,status,requested_by_user_id,valid_until)
 values(o,p_topic_id,'custom',jsonb_build_object('workflow_template_version_id',p_workflow_template_version_id),btrim(p_reason),'pending',actor,p_valid_until)
 returning id into exception_id;
 if route_status='routing_expired' then
   perform qarar_topics.apply_governance_snapshot(
     p_topic_id,'custom','routing_exception_pending',
     (select policy_id from qarar_topics.topics where id=p_topic_id),
     (select policy_version_id from qarar_topics.topics where id=p_topic_id),
     (select policy_item_id from qarar_topics.topics where id=p_topic_id),
     (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id),
     (select workflow_template_version_id from qarar_governance.workflow_instances where topic_id=p_topic_id order by started_at desc limit 1),
     (select id from qarar_governance.workflow_instances where topic_id=p_topic_id order by started_at desc limit 1),
     null,
     (select routing_decision_id from qarar_topics.topics where id=p_topic_id)
   );
 end if;
 return jsonb_build_object('id',exception_id,'topic_id',p_topic_id,'status','pending','governance_source','custom','valid_until',p_valid_until);
end $$;

create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null,p_idempotency_key uuid default null,p_expected_version integer default null
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();i qarar_governance.workflow_instances%rowtype;s qarar_governance.workflow_instance_steps%rowtype;ts qarar_governance.workflow_template_steps%rowtype;t qarar_governance.workflow_template_transitions%rowtype;n uuid;st text;source text;ctx jsonb;replay qarar_governance.workflow_instance_steps%rowtype;
begin
 if exists(select 1 from qarar_governance.topic_governance_mappings m join qarar_governance.governance_exceptions e on (m.snapshot->>'exception_id')::uuid=e.id
   where m.topic_id=p_topic_id and m.organization_id=o and (e.status='expired' or (e.status='approved' and e.valid_until<=now())))
 then raise exception using errcode='55000',message='انتهت صلاحية المسار المؤقت؛ اطلب تجديده ثم المراجعة المستقلة';end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='مفتاح التكرار مطلوب';end if;
 select * into replay from qarar_governance.workflow_instance_steps where action_idempotency_key=p_idempotency_key and workflow_instance_id in(select id from qarar_governance.workflow_instances where topic_id=p_topic_id and organization_id=o);
 if replay.id is not null then return jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',replay.workflow_instance_id,'completed_step_id',replay.id,'outcome',replay.outcome_code,'version',replay.action_version,'idempotent_replay',true);end if;
 select * into i from qarar_governance.workflow_instances where topic_id=p_topic_id and organization_id=o and status='active' for update;
 if i.id is null then raise exception using errcode='55000',message='لا يوجد مسار نشط';end if;
 select * into s from qarar_governance.workflow_instance_steps where id=i.current_step_id for update;
 if s.status<>'active' then raise exception using errcode='55000',message='لا توجد خطوة نشطة';end if;
 if p_expected_version is null or p_expected_version<>s.action_version then raise exception using errcode='40001',message='تم تعديل الخطوة؛ حدّث البيانات';end if;
 perform qarar_iam.assert_permission(coalesce(s.required_permission_code,'topics.review'),s.assigned_unit_id);
 select * into ts from qarar_governance.workflow_template_steps where id=s.template_step_id;
 ctx:=jsonb_build_object('outcome',p_outcome_code,'assigned_unit_id',s.assigned_unit_id,'topic_id',p_topic_id);
 if not qarar_governance.conditions_match(ts.entry_conditions,ctx) or not qarar_governance.conditions_match(ts.exit_conditions,ctx) then raise exception using errcode='55000',message='شروط الخطوة غير متحققة';end if;
 if ts.step_type='voting' and coalesce(current_setting('qarar.voting_transition',true),'')<>'on' then raise exception using errcode='55000',message='الخطوة التصويتية تُحسم من نتيجة التصويت فقط';end if;
 select * into t from qarar_governance.workflow_template_transitions where workflow_template_version_id=i.workflow_template_version_id and from_step_id=s.template_step_id and outcome_code=p_outcome_code;
 if t.id is null and not(ts.is_terminal and p_outcome_code=any(ts.allowed_outcomes)) then raise exception using errcode='22023',message='النتيجة غير مسموحة';end if;
 update qarar_governance.workflow_instance_steps set status=case when p_outcome_code='rejected' then 'rejected' else 'completed' end,acted_by_user_id=actor,acted_at=now(),outcome_code=p_outcome_code,comment=p_comment,action_idempotency_key=p_idempotency_key,action_version=action_version+1 where id=s.id;
 if t.to_step_id is not null then select id into n from qarar_governance.workflow_instance_steps where workflow_instance_id=i.id and template_step_id=t.to_step_id;update qarar_governance.workflow_instance_steps set status='active',opened_at=now() where id=n;update qarar_governance.workflow_instances set current_step_id=n where id=i.id;st:='active';else st:=case when p_outcome_code='rejected' then 'rejected' else 'completed' end;update qarar_governance.workflow_instances set status=st,current_step_id=null,completed_at=now() where id=i.id;end if;
 select governance_source into source from qarar_topics.topics where id=p_topic_id;
 perform qarar_topics.apply_governance_snapshot(p_topic_id,source,'routing_ready',(select policy_id from qarar_topics.topics where id=p_topic_id),(select policy_version_id from qarar_topics.topics where id=p_topic_id),(select policy_item_id from qarar_topics.topics where id=p_topic_id),(select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id),i.workflow_template_version_id,i.id,n,(select routing_decision_id from qarar_topics.topics where id=p_topic_id));
 return jsonb_build_object('topic_id',p_topic_id,'completed_step_id',s.id,'next_step_id',n,'workflow_status',st,'version',s.action_version+1);
end $$;

create or replace function qarar_governance.approve_custom_workflow(
  p_exception_id uuid,p_approve boolean,p_review_comment text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();e qarar_governance.governance_exceptions%rowtype;old_instance qarar_governance.workflow_instances%rowtype;step_id uuid;result jsonb;
begin
 perform qarar_iam.assert_permission('governance.exceptions.approve',null);
 select * into e from qarar_governance.governance_exceptions where id=p_exception_id and organization_id=o and requested_source='custom' and status='pending' for update;
 if e.id is null then raise exception using errcode='55000',message='طلب المسار المخصص غير موجود أو تمت مراجعته';end if;
 if e.requested_by_user_id=actor then raise exception using errcode='42501',message='لا يجوز لمقدم الطلب مراجعته';end if;
 if char_length(btrim(coalesce(p_review_comment,'')))<5 then raise exception using errcode='22023',message='تعليق المراجعة مطلوب';end if;
 select * into old_instance from qarar_governance.workflow_instances where topic_id=e.topic_id and organization_id=o and status='expired' for update;
 if old_instance.id is null then
   return qarar_governance.approve_workflow_exception(p_exception_id,p_approve,p_review_comment)||jsonb_build_object('governance_source','custom');
 end if;
 if not p_approve then
   update qarar_governance.governance_exceptions set status='rejected',reviewed_by_user_id=actor,reviewed_at=now(),review_comment=btrim(p_review_comment) where id=e.id;
   return jsonb_build_object('id',e.id,'status','rejected','governance_source','custom');
 end if;
 if old_instance.workflow_template_version_id<>(e.requested_route->>'workflow_template_version_id')::uuid then raise exception using errcode='22023',message='يجب أن يستخدم التجديد قالب المسار المنتهي نفسه';end if;
 step_id:=(old_instance.snapshot->>'expired_step_id')::uuid;
 if step_id is null then raise exception using errcode='55000',message='لا يمكن تجديد مسار منتهي بلا خطوة محفوظة';end if;
 update qarar_governance.governance_exceptions set status='approved',reviewed_by_user_id=actor,reviewed_at=now(),review_comment=btrim(p_review_comment) where id=e.id;
 update qarar_governance.workflow_instance_steps set status='active',opened_at=now(),comment=null where id=step_id and workflow_instance_id=old_instance.id and status='cancelled';
 update qarar_governance.workflow_instances set status='active',current_step_id=step_id,completed_at=null,snapshot=snapshot||jsonb_build_object('renewed_at',now(),'renewal_exception_id',e.id) where id=old_instance.id;
 update qarar_governance.topic_governance_mappings set governance_source='custom',routing_status='routing_ready',snapshot=jsonb_build_object('exception_id',e.id,'route',e.requested_route),mapped_by_user_id=actor,mapped_at=now() where topic_id=e.topic_id and organization_id=o;
 perform qarar_topics.apply_governance_snapshot(e.topic_id,'custom','routing_ready',null,null,null,null,old_instance.workflow_template_version_id,old_instance.id,step_id,(select routing_decision_id from qarar_topics.topics where id=e.topic_id));
 perform qarar_audit.append_audit_log(o,'governance.exception.renew','governance_exceptions',e.id,jsonb_build_object('topic_id',e.topic_id,'workflow_instance_id',old_instance.id));
 return jsonb_build_object('id',e.id,'status','approved','topic_id',e.topic_id,'workflow_instance_id',old_instance.id,'current_workflow_step_id',step_id,'governance_source','custom','renewed',true);
end $$;

alter function qarar_governance.expire_governance_exceptions(timestamptz) owner to qarar_governance_executor;
revoke all on function qarar_governance.expire_governance_exceptions(timestamptz) from public,anon,authenticated,service_role;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance' and p.proname='expire_governance_exceptions'
on conflict(function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
   create extension if not exists pg_cron;
   perform cron.unschedule(jobid) from cron.job where jobname='qarar-expire-governance-exceptions';
   perform cron.schedule('qarar-expire-governance-exceptions','* * * * *','select qarar_governance.expire_governance_exceptions()');
 end if;
exception when others then raise notice 'governance expiry scheduling skipped: %',sqlerrm;end $$;

commit;
