-- Atomic, tenant-scoped notification policy and safe template customization.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create table qarar_governance.notification_settings(
 organization_id uuid primary key references qarar_core.organizations(id) on delete restrict,
 whatsapp_enabled boolean not null default true,
 meeting_reminder_days integer not null default 2 check(meeting_reminder_days between 0 and 30),
 task_due_soon_days integer not null default 3 check(task_due_soon_days between 0 and 30),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by_user_id uuid,
 foreign key(updated_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict
);
create table qarar_governance.notification_template_settings(
 organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
 template_code text not null check(template_code in('meeting_invitation','meeting_reminder','meeting_cycle_due_soon','meeting_cycle_overdue','task_created_assignee','task_created_follower','task_due_soon','task_overdue','task_submitted','task_returned','task_completed')),
 enabled boolean not null default true,
 custom_intro text check(custom_intro is null or(char_length(btrim(custom_intro)) between 1 and 240)),
 custom_action text check(custom_action is null or(char_length(btrim(custom_action)) between 1 and 300)),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,template_code)
);
alter table qarar_governance.notification_settings enable row level security;
alter table qarar_governance.notification_settings force row level security;
alter table qarar_governance.notification_template_settings enable row level security;
alter table qarar_governance.notification_template_settings force row level security;
alter table qarar_governance.notification_settings owner to qarar_governance_executor;
alter table qarar_governance.notification_template_settings owner to qarar_governance_executor;
revoke all on qarar_governance.notification_settings,qarar_governance.notification_template_settings from public,anon,authenticated,service_role;
grant select,insert,update on qarar_governance.notification_settings,qarar_governance.notification_template_settings to qarar_governance_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('notification_settings','governance',false),('notification_template_settings','governance',false);

create function qarar_governance.admin_save_notification_settings(p_whatsapp_enabled boolean,p_meeting_reminder_days integer,p_task_due_soon_days integer,p_templates jsonb,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id();u uuid:=auth.uid();s qarar_governance.notification_settings%rowtype;i jsonb;codes text[]:='{}';
begin
 if not qarar_iam.is_system_admin() then raise exception using errcode='42501',message='هذه العملية متاحة لمسؤول النظام فقط';end if;
 if p_meeting_reminder_days not between 0 and 30 or p_task_due_soon_days not between 0 and 30 or jsonb_typeof(p_templates)<>'array' then raise exception using errcode='22023',message='تحقق من مدد التذكير والقوالب';end if;
 insert into qarar_governance.notification_settings(organization_id) values(o) on conflict do nothing;
 select * into s from qarar_governance.notification_settings where organization_id=o for update;
 if s.version<>p_expected_version then raise exception using errcode='40001',message='تغيرت الإعدادات في جلسة أخرى؛ حدّث الصفحة ثم أعد المحاولة';end if;
 for i in select * from jsonb_array_elements(p_templates) loop
  if i->>'code' is null or i->>'code'=any(codes) then raise exception using errcode='22023',message='قائمة القوالب غير صالحة';end if;
  codes:=array_append(codes,i->>'code');
  insert into qarar_governance.notification_template_settings(organization_id,template_code,enabled,custom_intro,custom_action,updated_at)
  values(o,i->>'code',coalesce((i->>'enabled')::boolean,true),nullif(btrim(i->>'custom_intro'),''),nullif(btrim(i->>'custom_action'),''),clock_timestamp())
  on conflict(organization_id,template_code) do update set enabled=excluded.enabled,custom_intro=excluded.custom_intro,custom_action=excluded.custom_action,updated_at=excluded.updated_at;
 end loop;
 update qarar_governance.notification_settings set whatsapp_enabled=p_whatsapp_enabled,meeting_reminder_days=p_meeting_reminder_days,task_due_soon_days=p_task_due_soon_days,version=version+1,updated_at=clock_timestamp(),updated_by_user_id=u where organization_id=o returning * into s;
 perform qarar_audit.append_audit_log(o,'notifications.settings.updated','notification_settings',o,jsonb_build_object('version',s.version,'whatsapp_enabled',s.whatsapp_enabled,'template_count',cardinality(codes)));
 return jsonb_build_object('version',s.version,'updated_at',s.updated_at);
end $$;

-- Keep the enrichment implementation intact and layer policy resolution around it.
alter function qarar_governance.get_notification_dispatch_context(uuid,uuid) rename to get_notification_dispatch_context_base;
update qarar_architecture.function_registry r set function_name=p.proname,identity_arguments=pg_get_function_identity_arguments(p.oid) from pg_proc p where p.oid=r.function_oid and p.proname='get_notification_dispatch_context_base';
create function qarar_governance.get_notification_dispatch_context(p_event_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare c jsonb;code text;s qarar_governance.notification_settings%rowtype;t qarar_governance.notification_template_settings%rowtype;
begin
 c:=qarar_governance.get_notification_dispatch_context_base(p_event_id,p_lock_token);
 code:=case c->>'event_type' when 'meeting.invitation.requested' then 'meeting_invitation' when 'meeting.reminder.due' then 'meeting_reminder' when 'meeting.cycle.due_soon' then 'meeting_cycle_due_soon' when 'meeting.cycle.overdue' then 'meeting_cycle_overdue' when 'execution.task.due_soon' then 'task_due_soon' when 'execution.task.overdue' then 'task_overdue' when 'execution.task.submitted' then 'task_submitted' when 'execution.task.returned' then 'task_returned' when 'execution.task.completed' then 'task_completed' when 'execution.task.created' then case when c#>>'{payload,recipient_role}'='follower' then 'task_created_follower' else 'task_created_assignee' end end;
 select * into s from qarar_governance.notification_settings where organization_id=(c->>'organization_id')::uuid;
 select * into t from qarar_governance.notification_template_settings where organization_id=(c->>'organization_id')::uuid and template_code=code;
 return c||jsonb_build_object('channel_enabled',coalesce(s.whatsapp_enabled,true),'event_enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action);
end $$;

alter function qarar_governance.admin_get_notification_workspace(integer) rename to admin_get_notification_workspace_base;
update qarar_architecture.function_registry r set function_name=p.proname,identity_arguments=pg_get_function_identity_arguments(p.oid) from pg_proc p where p.oid=r.function_oid and p.proname='admin_get_notification_workspace_base';
create or replace function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id();base jsonb;s qarar_governance.notification_settings%rowtype;ts jsonb;
begin
 if not qarar_iam.is_system_admin() then raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';end if;
 select qarar_governance.admin_get_notification_workspace_base(p_limit) into base;
 select * into s from qarar_governance.notification_settings where organization_id=o;
 select jsonb_agg(jsonb_build_object('code',v.code,'label',v.label,'description',v.description,'enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action) order by v.ord) into ts from (values
 (1,'meeting_invitation','دعوة اجتماع','دعوة العضو مع تفاصيل الاجتماع.'),(2,'meeting_reminder','تذكير باجتماع','تذكير قبل الموعد.'),(3,'meeting_cycle_due_soon','قرب انتهاء دورة اجتماع','تنبيه قيادة المجلس قبل انتهاء الدورة.'),(4,'meeting_cycle_overdue','انتهاء دورة اجتماع','تنبيه عند انتهاء الدورة.'),(5,'task_created_assignee','تكليف جديد','إشعار المكلّف بالتنفيذ.'),(6,'task_created_follower','متابعة تكليف جديد','إشعار المتابع بمسؤوليته.'),(7,'task_due_soon','قرب استحقاق تكليف','تذكير قبل موعد الإنجاز.'),(8,'task_overdue','تكليف متأخر','تنبيه بعد تجاوز الموعد.'),(9,'task_submitted','تكليف بانتظار التحقق','إشعار المتابع بالتسليم.'),(10,'task_returned','إعادة تكليف للاستكمال','إشعار المكلّف بالملاحظات.'),(11,'task_completed','اكتمال تكليف','إشعار اعتماد الإنجاز.')
 )v(ord,code,label,description) left join qarar_governance.notification_template_settings t on t.organization_id=o and t.template_code=v.code;
 return base||jsonb_build_object('policy',jsonb_build_object('whatsapp_enabled',coalesce(s.whatsapp_enabled,true),'meeting_reminder_days',coalesce(s.meeting_reminder_days,2),'task_due_soon_days',coalesce(s.task_due_soon_days,3),'version',coalesce(s.version,1),'updated_at',s.updated_at),'templates',ts);
end $$;

create function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_save_notification_settings($1,$2,$3,$4,$5)$$;
alter function qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) owner to qarar_governance_executor;
alter function qarar_governance.get_notification_dispatch_context(uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.admin_get_notification_workspace(integer) owner to qarar_governance_executor;
alter function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) owner to qarar_api_executor;
revoke all on function qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer),qarar_governance.get_notification_dispatch_context(uuid,uuid),qarar_governance.admin_get_notification_workspace(integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer),qarar_governance.get_notification_dispatch_context(uuid,uuid),qarar_governance.admin_get_notification_workspace(integer) to qarar_api_executor;
revoke all on function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) from public,anon;
grant execute on function api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p where p.oid in('qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)'::regprocedure,'qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure,'qarar_governance.admin_get_notification_workspace(integer)'::regprocedure);
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values('v1','admin_save_notification_settings','qarar_governance','admin_save_notification_settings','p_whatsapp_enabled boolean, p_meeting_reminder_days integer, p_task_due_soon_days integer, p_templates jsonb, p_expected_version integer','governance','authenticated');
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';
notify pgrst,'reload schema';
commit;
