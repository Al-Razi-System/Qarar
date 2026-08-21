-- User-provided evidence for a topic.  The binary stays in the private
-- qarar-evidence bucket; this table contains only governed metadata.

create table if not exists qarar_topics.topic_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  topic_id uuid not null references qarar_topics.topics(id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  file_url text not null check (file_url ~ '^https?://'),
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  description text null check (description is null or char_length(btrim(description)) <= 2000),
  uploaded_by_user_id uuid not null references qarar_iam.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique(id, organization_id),
  foreign key(topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete cascade,
  foreign key(uploaded_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict
);
create index if not exists topic_attachments_topic_idx on qarar_topics.topic_attachments(organization_id,topic_id,created_at desc);
alter table qarar_topics.topic_attachments enable row level security;
revoke all on qarar_topics.topic_attachments from public,anon,authenticated;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('topic_attachments','topics',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=excluded.legacy_public_view;

create or replace function qarar_topics.list_topic_attachments(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_unit uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
  if v_unit is null then raise exception 'topic not found' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'file_url',a.file_url,'mime_type',a.mime_type,'file_size_bytes',a.file_size_bytes,'description',a.description,'created_at',a.created_at) order by a.created_at desc)
    from qarar_topics.topic_attachments a where a.topic_id=p_topic_id and a.organization_id=qarar_iam.current_organization_id()),'[]'::jsonb);
end $$;

create or replace function qarar_topics.add_topic_attachment(
  p_topic_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,p_description text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_unit uuid; v_id uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics where id=p_topic_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_unit is null then raise exception 'topic not found' using errcode='P0002'; end if;
  perform qarar_iam.assert_permission('topics.create',v_unit);
  insert into qarar_topics.topic_attachments(organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,description,uploaded_by_user_id)
  values(qarar_iam.current_organization_id(),p_topic_id,btrim(p_file_name),p_file_url,btrim(p_mime_type),p_file_size_bytes,nullif(btrim(coalesce(p_description,'')),''),auth.uid()) returning id into v_id;
  perform qarar_audit.append_audit_log(qarar_iam.current_organization_id(),'topic.attachment.add','topic_attachments',v_id,jsonb_build_object('topic_id',p_topic_id,'file_name',p_file_name));
  return jsonb_build_object('id',v_id);
end $$;

create or replace function qarar_topics.remove_topic_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attachment qarar_topics.topic_attachments%rowtype; v_unit uuid;
begin
  select * into v_attachment from qarar_topics.topic_attachments where id=p_attachment_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_attachment.id is null then raise exception 'attachment not found' using errcode='P0002'; end if;
  select current_unit_id into v_unit from qarar_topics.topics where id=v_attachment.topic_id;
  perform qarar_iam.assert_permission('topics.create',v_unit);
  delete from qarar_topics.topic_attachments where id=v_attachment.id;
  perform qarar_audit.append_audit_log(qarar_iam.current_organization_id(),'topic.attachment.remove','topic_attachments',v_attachment.id,jsonb_build_object('topic_id',v_attachment.topic_id));
  return jsonb_build_object('id',v_attachment.id,'deleted',true);
end $$;

create or replace function api_v1.list_topic_attachments(p_topic_id uuid) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select qarar_topics.list_topic_attachments($1) $$;
create or replace function api_v1.add_topic_attachment(p_topic_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,p_description text default null) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select qarar_topics.add_topic_attachment($1,$2,$3,$4,$5,$6) $$;
create or replace function api_v1.remove_topic_attachment(p_attachment_id uuid) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select qarar_topics.remove_topic_attachment($1) $$;
alter function qarar_topics.list_topic_attachments(uuid) owner to qarar_topics_executor;
alter function qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text) owner to qarar_topics_executor;
alter function qarar_topics.remove_topic_attachment(uuid) owner to qarar_topics_executor;
revoke all on function qarar_topics.list_topic_attachments(uuid),qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text),qarar_topics.remove_topic_attachment(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_topics.list_topic_attachments(uuid),qarar_topics.add_topic_attachment(uuid,text,text,text,bigint,text),qarar_topics.remove_topic_attachment(uuid) to qarar_api_executor;
alter function api_v1.list_topic_attachments(uuid) owner to qarar_api_executor;
alter function api_v1.add_topic_attachment(uuid,text,text,text,bigint,text) owner to qarar_api_executor;
alter function api_v1.remove_topic_attachment(uuid) owner to qarar_api_executor;
grant execute on function api_v1.list_topic_attachments(uuid),api_v1.add_topic_attachment(uuid,text,text,text,bigint,text),api_v1.remove_topic_attachment(uuid) to authenticated,service_role;
revoke execute on function api_v1.list_topic_attachments(uuid),api_v1.add_topic_attachment(uuid,text,text,text,bigint,text),api_v1.remove_topic_attachment(uuid) from public,anon;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics','qarar_topics',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname in ('list_topic_attachments','add_topic_attachment','remove_topic_attachment')
  and not exists(select 1 from qarar_architecture.function_registry e where e.function_name=p.proname and e.identity_arguments=pg_get_function_identity_arguments(p.oid))
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
 ('v1','list_topic_attachments','qarar_topics','list_topic_attachments','p_topic_id uuid','topics','authenticated'),
 ('v1','add_topic_attachment','qarar_topics','add_topic_attachment','p_topic_id uuid, p_file_name text, p_file_url text, p_mime_type text, p_file_size_bytes bigint, p_description text','topics','authenticated'),
 ('v1','remove_topic_attachment','qarar_topics','remove_topic_attachment','p_attachment_id uuid','topics','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
