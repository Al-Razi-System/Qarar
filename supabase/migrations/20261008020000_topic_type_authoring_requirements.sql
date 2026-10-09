begin;

create table qarar_governance.topic_type_authoring_profiles_v2 (
 topic_type_version_id uuid primary key,
 organization_id uuid not null,
 scope_kind text not null check(scope_kind in ('route','councils','classes')),
 required_attachment_count integer not null default 0 check(required_attachment_count between 0 and 50),
 submission_mode text not null default 'manual' check(submission_mode in ('manual','automatic_agenda')),
 foreign key(topic_type_version_id,organization_id) references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict
);
create table qarar_governance.topic_type_origin_scopes_v2 (
 topic_type_version_id uuid not null,
 organization_id uuid not null,
 council_id uuid,
 governance_class_id uuid,
 check(num_nonnulls(council_id,governance_class_id)=1),
 foreign key(topic_type_version_id,organization_id) references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict,
 foreign key(council_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
 foreign key(governance_class_id,organization_id) references qarar_governance.governance_unit_classes(id,organization_id) on delete restrict
);
create unique index topic_type_origin_council on qarar_governance.topic_type_origin_scopes_v2(topic_type_version_id,council_id) where council_id is not null;
create unique index topic_type_origin_class on qarar_governance.topic_type_origin_scopes_v2(topic_type_version_id,governance_class_id) where governance_class_id is not null;
alter table qarar_governance.legal_authorities_v2 add column source_policy_item_id uuid;
alter table qarar_governance.legal_authorities_v2 add foreign key(source_policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete restrict;
alter table qarar_governance.topic_type_authoring_profiles_v2 enable row level security;
alter table qarar_governance.topic_type_authoring_profiles_v2 force row level security;
alter table qarar_governance.topic_type_origin_scopes_v2 enable row level security;
alter table qarar_governance.topic_type_origin_scopes_v2 force row level security;
revoke all on qarar_governance.topic_type_authoring_profiles_v2,qarar_governance.topic_type_origin_scopes_v2 from public,anon,authenticated,service_role;
grant select,insert,update,delete on qarar_governance.topic_type_authoring_profiles_v2,qarar_governance.topic_type_origin_scopes_v2 to qarar_governance_executor;

-- Date-only occurrence windows, never a live meeting or a topic mutation.
create function qarar_governance.topic_schedule_window_v2(p_rule text,p_config jsonb,p_on date)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
declare first_day date; last_day date; starts date; ends date; week_no integer; month_no integer; day_no integer;
begin
 if p_on is null or jsonb_typeof(p_config) is distinct from 'object' then raise exception using errcode='22023',message='إعداد توقيت الموضوع غير صالح'; end if;
 if p_rule='none' then return null; end if;
 if p_rule='fixed_date' then
  first_day:=(p_config->>'date')::date;
  if first_day is null then raise exception using errcode='22023',message='حدد تاريخ مناقشة الموضوع'; end if;
  last_day:=first_day;
 elsif p_rule in ('monthly_week','seasonal') then
  starts:=(p_config->>'starts_on')::date; ends:=nullif(p_config->>'ends_on','')::date;
  if starts is null or (ends is not null and ends<starts) then raise exception using errcode='22023',message='حدد بداية الدورية ونهاية لا تسبقها'; end if;
  if p_rule='monthly_week' then
   week_no:=(p_config->>'week')::integer;
   if week_no is null or week_no not between 1 and 4 then raise exception using errcode='22023',message='اختر أسبوعًا من الأول إلى الرابع'; end if;
   first_day:=date_trunc('month',p_on)::date+(week_no-1)*7;
   last_day:=case when week_no=4 then (date_trunc('month',p_on)+interval '1 month - 1 day')::date else first_day+6 end;
  else
   month_no:=(p_config->>'month')::integer; day_no:=(p_config->>'day')::integer;
   if month_no is null or day_no is null or month_no not between 1 and 12 or day_no not between 1 and 31 then raise exception using errcode='22023',message='حدد يوم وشهر الموعد السنوي'; end if;
   -- Invalid dates such as 31 February are rejected, not silently shifted.
   first_day:=make_date(extract(year from p_on)::integer,month_no,day_no); last_day:=first_day;
  end if;
  if last_day<starts or (ends is not null and first_day>ends) then return null; end if;
  first_day:=greatest(first_day,starts); last_day:=least(last_day,coalesce(ends,last_day));
 else raise exception using errcode='22023',message='نوع توقيت الموضوع غير مدعوم'; end if;
 return jsonb_build_object('available_from',first_day,'due_on',last_day,'is_due',p_on between first_day and last_day);
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
 raise exception using errcode='22023',message='راجع تاريخ الموضوع وأيام الدورية';
end $$;

create function qarar_governance.topic_type_origin_allowed_v2(p_version uuid,p_council uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select not exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 p where p.topic_type_version_id=p_version and p.organization_id=qarar_iam.current_organization_id() and p.scope_kind<>'route')
 or exists(select 1 from qarar_governance.topic_type_origin_scopes_v2 s join qarar_core.governance_units u on u.id=p_council and u.organization_id=s.organization_id
 join qarar_governance.topic_type_authoring_profiles_v2 p on p.topic_type_version_id=s.topic_type_version_id and p.organization_id=s.organization_id
 where s.topic_type_version_id=p_version and s.organization_id=qarar_iam.current_organization_id()
 and ((p.scope_kind='councils' and s.council_id=u.id) or (p.scope_kind='classes' and s.governance_class_id=u.governance_class_id)))
$$;
create function qarar_governance.topic_type_authoring_settings_v2(p_version uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select to_jsonb(p)||jsonb_build_object('scope_ids',coalesce((select jsonb_agg(coalesce(s.council_id,s.governance_class_id)) from qarar_governance.topic_type_origin_scopes_v2 s where s.topic_type_version_id=p_version and s.organization_id=p.organization_id),'[]'::jsonb),
 'source_items',coalesce((select jsonb_agg(jsonb_build_object('id',l.source_policy_item_id,'reference_number',l.reference_number,'source_document_name',l.source_document_name,'text',l.authority_text)) from qarar_governance.topic_type_authorities_v2 a join qarar_governance.legal_authorities_v2 l on l.id=a.legal_authority_id and l.organization_id=a.organization_id where a.topic_type_version_id=p_version and a.organization_id=p.organization_id and l.source_policy_item_id is not null),'[]'::jsonb))
 from qarar_governance.topic_type_authoring_profiles_v2 p where p.topic_type_version_id=p_version and p.organization_id=qarar_iam.current_organization_id()
$$;

alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) rename to save_governance_bundle_identity_v2;
create function qarar_governance.save_governance_bundle_draft_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); settings jsonb:=p_bundle->'authoring'; fp text; receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype; result jsonb; vid uuid; target uuid; item record; authority uuid; count_required integer; mode text; scope text; rule text; config jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 if settings is null then return qarar_governance.save_governance_bundle_identity_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle); end if;
 if o is null or actor is null or p_client_request_id is null then raise exception using errcode='22023',message='تعذر تحديد سياق حفظ التصنيف'; end if;
 fp:=encode(sha256(convert_to(coalesce(p_bundle_id::text,'new')||':'||coalesce(p_expected_lock_version::text,'new')||':'||p_bundle::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 scope:=settings->>'scope_kind'; mode:=settings->>'submission_mode';
 if jsonb_typeof(settings) is distinct from 'object' or scope is null or scope not in ('route','councils','classes') or mode is null or mode not in ('manual','automatic_agenda')
 or jsonb_typeof(settings->'scope_ids') is distinct from 'array' or jsonb_typeof(settings->'source_item_ids') is distinct from 'array'
 or coalesce(settings->>'required_attachment_count','')!~'^\d{1,2}$'
 or exists(select 1 from jsonb_object_keys(settings) k where k not in ('scope_kind','scope_ids','source_item_ids','required_attachment_count','submission_mode')) then
  raise exception using errcode='22023',message='راجع نطاق التصنيف وأسانيده ومتطلبات المرفقات'; end if;
 count_required:=(settings->>'required_attachment_count')::integer;
 if count_required>50 or jsonb_array_length(settings->'scope_ids')>100 or jsonb_array_length(settings->'source_item_ids')>100
 or (scope='route' and jsonb_array_length(settings->'scope_ids')<>0) or (scope<>'route' and jsonb_array_length(settings->'scope_ids')=0) then
 raise exception using errcode='22023',message='حدد النطاق المطلوب وعددًا صحيحًا للمرفقات'; end if;
 if (select count(distinct x) from jsonb_array_elements_text(settings->'scope_ids') x)<>jsonb_array_length(settings->'scope_ids') or (select count(distinct x) from jsonb_array_elements_text(settings->'source_item_ids') x)<>jsonb_array_length(settings->'source_item_ids') then raise exception using errcode='22023',message='لا تكرر المجلس أو البند في التصنيف'; end if;
 rule:=p_bundle->'schedule'->>'rule_type'; config:=p_bundle->'schedule'->'rule_config';
 perform qarar_governance.topic_schedule_window_v2(rule,config,current_date);
 result:=qarar_governance.save_governance_bundle_identity_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle-'authoring');
 select topic_type_version_id into vid from qarar_governance.governance_bundles_v2 where id=(result->>'bundle_id')::uuid and organization_id=o;
 insert into qarar_governance.topic_type_authoring_profiles_v2 values(vid,o,scope,count_required,mode)
 on conflict(topic_type_version_id) do update set scope_kind=excluded.scope_kind,required_attachment_count=excluded.required_attachment_count,submission_mode=excluded.submission_mode;
 delete from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id=vid and organization_id=o;
 for target in select value::uuid from jsonb_array_elements_text(settings->'scope_ids') loop
  if scope='councils' and not exists(select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.id=target and u.organization_id=o and u.status in ('active','inactive') and t.is_council_type) then raise exception using errcode='22023',message='المجلس المحدد غير متاح في مؤسستك'; end if;
  if scope='classes' and not exists(select 1 from qarar_governance.governance_unit_classes c where c.id=target and c.organization_id=o and c.is_active) then raise exception using errcode='22023',message='مستوى المجلس المحدد غير متاح'; end if;
  insert into qarar_governance.topic_type_origin_scopes_v2 values(vid,o,case when scope='councils' then target end,case when scope='classes' then target end);
 end loop;
 -- Source snapshots are taken only from published, active regulation items.
 delete from qarar_governance.topic_type_authorities_v2 a using qarar_governance.legal_authorities_v2 l where a.legal_authority_id=l.id and a.organization_id=o and a.topic_type_version_id=vid and l.organization_id=o and l.source_policy_item_id is not null;
 for target in select value::uuid from jsonb_array_elements_text(settings->'source_item_ids') loop
  select i.*,p.name_ar document_name,v.version_no,v.effective_from,v.effective_to into item from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id and v.organization_id=i.organization_id join qarar_governance.policies p on p.id=v.policy_id and p.organization_id=v.organization_id
  where i.id=target and i.organization_id=o and i.is_active and i.item_type not in ('chapter','section') and p.status='active' and v.legal_status='effective' and v.effective_from<=current_date and (v.effective_to is null or v.effective_to>=current_date) and nullif(btrim(coalesce(i.official_text,i.body_text)),'') is not null;
  if not found then raise exception using errcode='22023',message='اختر بندًا نشطًا من نص لائحة نافذ؛ حدّث الخيارات إذا تغير البند'; end if;
  insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,source_document_version,article_number,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,effective_from,effective_to,reviewed_by_user_id,reviewed_at,created_by_user_id,source_policy_item_id)
  values(o,item.document_name,item.version_no::text,item.item_code,coalesce(item.official_text,item.body_text),'jurisdiction',encode(sha256(convert_to('policy-item:'||target::text||':'||coalesce(item.official_text,item.body_text),'UTF8')),'hex'),'approved',true,item.effective_from,item.effective_to,actor,now(),actor,target)
  on conflict(organization_id,source_fingerprint) do nothing returning id into authority;
  if authority is null then select id into authority from qarar_governance.legal_authorities_v2 where organization_id=o and source_fingerprint=encode(sha256(convert_to('policy-item:'||target::text||':'||coalesce(item.official_text,item.body_text),'UTF8')),'hex'); end if;
  insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id) values(o,vid,authority,'jurisdiction',actor);
  authority:=null;
 end loop;
 result:=result||jsonb_build_object('authoring',qarar_governance.topic_type_authoring_settings_v2(vid),'validation_summary',qarar_governance.validate_governance_bundle_v2_core((result->>'bundle_id')::uuid));
 update qarar_governance.governance_bundle_command_receipts_v2 set request_fingerprint=fp,response_payload=result where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 return result;
end $$;

alter function qarar_governance.get_governance_authoring_options_v2() rename to get_governance_authoring_route_options_v2;
create function qarar_governance.get_governance_authoring_options_v2() returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; o uuid:=qarar_iam.current_organization_id();
begin
 result:=qarar_governance.get_governance_authoring_route_options_v2();
 return result||jsonb_build_object(
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'governance_class_id',u.governance_class_id) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and u.status in ('active','inactive') and t.is_council_type),'[]'::jsonb),
 'council_classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar) from qarar_governance.governance_unit_classes where organization_id=o and is_active),'[]'::jsonb),
 'source_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name_ar',i.title_ar,'reference_number',i.reference_number,'document_name',p.name_ar) order by p.name_ar,i.sort_order) from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id and v.organization_id=i.organization_id join qarar_governance.policies p on p.id=v.policy_id and p.organization_id=v.organization_id where i.organization_id=o and i.is_active and i.item_type not in ('chapter','section') and v.legal_status='effective' and p.status='active' and v.effective_from<=current_date and (v.effective_to is null or v.effective_to>=current_date) and char_length(btrim(coalesce(i.official_text,i.body_text,'')))>=10),'[]'::jsonb));
end $$;

alter function qarar_governance.list_effective_topic_types_v2(uuid,date) rename to list_effective_topic_types_route_v2;
create function qarar_governance.list_effective_topic_types_v2(p_origin_governance_unit_id uuid,p_effective_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result:=qarar_governance.list_effective_topic_types_route_v2(p_origin_governance_unit_id,p_effective_on);
 return coalesce((select jsonb_agg(x||jsonb_build_object('authoring',qarar_governance.topic_type_authoring_settings_v2((x->>'topic_type_version_id')::uuid))) from jsonb_array_elements(result) x where qarar_governance.topic_type_origin_allowed_v2((x->>'topic_type_version_id')::uuid,p_origin_governance_unit_id)),'[]'::jsonb);
end $$;
alter function qarar_governance.preview_topic_route_v2(uuid,uuid,date) rename to preview_topic_route_order_v2;
create function qarar_governance.preview_topic_route_v2(p_topic_type_version_id uuid,p_origin_governance_unit_id uuid,p_effective_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result:=qarar_governance.preview_topic_route_order_v2(p_topic_type_version_id,p_origin_governance_unit_id,p_effective_on);
 if not qarar_governance.topic_type_origin_allowed_v2(p_topic_type_version_id,p_origin_governance_unit_id) then raise exception using errcode='42501',message='هذا التصنيف غير متاح للمجلس المحدد'; end if;
 return result||jsonb_build_object('authoring',qarar_governance.topic_type_authoring_settings_v2(p_topic_type_version_id));
end $$;
alter function qarar_governance.get_governance_bundle_v2(uuid) rename to get_governance_bundle_route_v2;
create function qarar_governance.get_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result:=qarar_governance.get_governance_bundle_route_v2(p_bundle_id);
 return result||jsonb_build_object('authoring',qarar_governance.topic_type_authoring_settings_v2((result#>>'{version,id}')::uuid));
end $$;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('topic_type_authoring_profiles_v2','governance',false),('topic_type_origin_scopes_v2','governance',false);
update qarar_architecture.function_registry r set function_name=p.proname from pg_proc p where p.oid=r.function_oid and p.proname in ('save_governance_bundle_identity_v2','get_governance_authoring_route_options_v2','list_effective_topic_types_route_v2','preview_topic_route_order_v2','get_governance_bundle_route_v2');
do $$ declare f record; begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace='qarar_governance'::regnamespace and p.proname in ('topic_schedule_window_v2','topic_type_origin_allowed_v2','topic_type_authoring_settings_v2','save_governance_bundle_draft_v2','get_governance_authoring_options_v2','list_effective_topic_types_v2','preview_topic_route_v2','get_governance_bundle_v2') loop
  execute format('alter function qarar_governance.%I(%s) owner to qarar_governance_executor',f.proname,f.args);
  execute format('revoke all on function qarar_governance.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
  execute format('grant execute on function qarar_governance.%I(%s) to qarar_governance_executor',f.proname,f.args);
  if f.proname in ('save_governance_bundle_draft_v2','get_governance_authoring_options_v2','list_effective_topic_types_v2','preview_topic_route_v2','get_governance_bundle_v2') then execute format('grant execute on function qarar_governance.%I(%s) to qarar_api_executor',f.proname,f.args); end if;
  insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values(f.oid,f.proname,f.args,'governance','qarar_governance',false);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
