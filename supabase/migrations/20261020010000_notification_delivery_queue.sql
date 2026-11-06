-- Provider-neutral delivery work, separate from domain outbox production.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create table qarar_governance.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outbox_event_id uuid not null,
  recipient_user_id uuid not null,
  channel text not null check (channel in ('whatsapp')),
  template_code text not null check (template_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  template_version text not null check (template_version ~ '^v[1-9][0-9]*$'),
  destination text not null check (destination ~ '^\+[1-9][0-9]{7,14}$'),
  destination_masked text not null,
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables) = 'object'),
  provider_code text,
  provider_message_id text,
  status text not null default 'queued' check (status in (
    'queued','processing','retry_wait','accepted','sent','delivered','read','skipped','failed','dead_letter'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  locked_by_worker_id uuid,
  lock_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id, organization_id),
  unique(outbox_event_id, channel, recipient_user_id, template_code, template_version),
  foreign key(organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key(outbox_event_id, organization_id) references qarar_governance.notification_outbox(id, organization_id) on delete restrict,
  foreign key(recipient_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (
    (status = 'processing' and locked_at is not null and locked_by_worker_id is not null and lock_token is not null and lease_expires_at > locked_at)
    or
    (status <> 'processing' and locked_at is null and locked_by_worker_id is null and lock_token is null and lease_expires_at is null)
  )
);

create index notification_deliveries_dispatch_idx
  on qarar_governance.notification_deliveries(channel, available_at, created_at)
  where status in ('queued','retry_wait');
create index notification_deliveries_provider_message_idx
  on qarar_governance.notification_deliveries(provider_code, provider_message_id)
  where provider_message_id is not null;

create table qarar_governance.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  delivery_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  outcome text not null check (outcome in ('accepted','retry','failed','dead_letter')),
  provider_code text,
  provider_message_id text,
  error_code text,
  http_status integer check (http_status between 100 and 599),
  created_at timestamptz not null default clock_timestamp(),
  unique(delivery_id, attempt_no),
  foreign key(delivery_id, organization_id) references qarar_governance.notification_deliveries(id, organization_id) on delete restrict
);

alter table qarar_governance.notification_deliveries enable row level security;
alter table qarar_governance.notification_deliveries force row level security;
alter table qarar_governance.notification_delivery_attempts enable row level security;
alter table qarar_governance.notification_delivery_attempts force row level security;
alter table qarar_governance.notification_deliveries owner to qarar_governance_executor;
alter table qarar_governance.notification_delivery_attempts owner to qarar_governance_executor;
revoke all on qarar_governance.notification_deliveries, qarar_governance.notification_delivery_attempts from public,anon,authenticated,service_role;
grant select,insert,update on qarar_governance.notification_deliveries to qarar_governance_executor;
grant select,insert on qarar_governance.notification_delivery_attempts to qarar_governance_executor;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
('notification_deliveries','governance',false),
('notification_delivery_attempts','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

create function qarar_governance.mask_notification_destination(p_destination text)
returns text language sql immutable security definer set search_path=pg_catalog as $$
  select case when char_length(p_destination) < 8 then '***'
    else left(p_destination, 4) || repeat('*', greatest(char_length(p_destination)-7, 3)) || right(p_destination, 3) end
$$;

create function qarar_governance.materialize_notification_delivery(
  p_event_id uuid,p_lock_token uuid,p_channel text,p_template_code text,p_template_version text,p_destination text,p_variables jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare v_event qarar_governance.notification_outbox%rowtype; v_delivery qarar_governance.notification_deliveries%rowtype; v_recipient uuid;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
  select d.* into v_delivery from qarar_governance.notification_deliveries d
   where d.outbox_event_id=p_event_id and d.channel=p_channel and d.template_code=p_template_code and d.template_version=p_template_version;
  if found then return jsonb_build_object('id',v_delivery.id,'status',v_delivery.status,'idempotent_replay',true);end if;
  if p_channel<>'whatsapp' or p_destination !~ '^\+[1-9][0-9]{7,14}$' or jsonb_typeof(coalesce(p_variables,'{}'::jsonb))<>'object' then
    raise exception using errcode='22023',message='invalid delivery request';end if;
  select * into v_event from qarar_governance.notification_outbox where id=p_event_id for update;
  if v_event.id is null or v_event.status<>'processing' or v_event.lock_token is distinct from p_lock_token or v_event.lease_expires_at<=clock_timestamp() then
    raise exception using errcode='40001',message='notification event lease is not current';end if;
  v_recipient:=nullif(v_event.payload->>'recipient_user_id','')::uuid;
  if v_recipient is null or not exists(select 1 from qarar_iam.users u where u.id=v_recipient and u.organization_id=v_event.organization_id) then
    raise exception using errcode='23503',message='notification recipient is not in the event organization';end if;
  insert into qarar_governance.notification_deliveries(organization_id,outbox_event_id,recipient_user_id,channel,template_code,template_version,destination,destination_masked,variables)
  values(v_event.organization_id,v_event.id,v_recipient,p_channel,p_template_code,p_template_version,p_destination,qarar_governance.mask_notification_destination(p_destination),coalesce(p_variables,'{}'::jsonb))
  returning * into v_delivery;
  update qarar_governance.notification_outbox set status='processed',processed_at=clock_timestamp(),locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null
   where id=v_event.id;
  return jsonb_build_object('id',v_delivery.id,'status',v_delivery.status,'idempotent_replay',false);
end $$;

create function qarar_governance.claim_notification_deliveries(p_worker_id uuid,p_lock_token uuid,p_channel text,p_limit integer,p_lease_seconds integer)
returns table(id uuid,organization_id uuid,outbox_event_id uuid,recipient_user_id uuid,channel text,template_code text,template_version text,destination text,variables jsonb,status text,attempts integer,lock_token uuid,lease_expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 if p_worker_id is null or p_lock_token is null or p_channel is null or p_limit not between 1 and 100 or p_lease_seconds not between 15 and 900 then
  raise exception using errcode='22023',message='invalid delivery claim';end if;
 update qarar_governance.notification_deliveries d set status='retry_wait',locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,available_at=clock_timestamp()
  where d.status='processing' and d.lease_expires_at<=clock_timestamp();
 return query with candidates as (
  select d.id from qarar_governance.notification_deliveries d where d.channel=p_channel and d.status in ('queued','retry_wait') and d.available_at<=clock_timestamp()
  order by d.available_at,d.created_at,d.id for update skip locked limit p_limit
 ), claimed as (
  update qarar_governance.notification_deliveries d set status='processing',attempts=d.attempts+1,locked_at=clock_timestamp(),locked_by_worker_id=p_worker_id,
   lock_token=p_lock_token,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp()
  from candidates c where d.id=c.id returning d.*
 ) select c.id,c.organization_id,c.outbox_event_id,c.recipient_user_id,c.channel,c.template_code,c.template_version,c.destination,c.variables,c.status,c.attempts,c.lock_token,c.lease_expires_at from claimed c;
end $$;

create function qarar_governance.complete_notification_delivery(p_delivery_id uuid,p_lock_token uuid,p_provider_code text,p_provider_message_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare d qarar_governance.notification_deliveries%rowtype;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 update qarar_governance.notification_deliveries set status='accepted',provider_code=left(nullif(btrim(p_provider_code),''),50),provider_message_id=left(nullif(btrim(p_provider_message_id),''),255),
  accepted_at=clock_timestamp(),locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token and lease_expires_at>clock_timestamp() returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,provider_message_id)
 values(d.organization_id,d.id,d.attempts,'accepted',d.provider_code,d.provider_message_id);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id);
end $$;

create function qarar_governance.fail_notification_delivery(p_delivery_id uuid,p_lock_token uuid,p_error_code text,p_provider_code text,p_http_status integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare d qarar_governance.notification_deliveries%rowtype; v_error text:=left(nullif(btrim(p_error_code),''),100);
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 if v_error is null then raise exception using errcode='22023',message='bounded error code required';end if;
 update qarar_governance.notification_deliveries set status=case when attempts>=8 then 'dead_letter' else 'retry_wait' end,
  available_at=case when attempts>=8 then available_at else clock_timestamp()+make_interval(secs=>least(3600,30*power(2,greatest(attempts-1,0))::integer)) end,
  provider_code=left(nullif(btrim(p_provider_code),''),50),last_error_code=v_error,locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token and lease_expires_at>clock_timestamp() returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,error_code,http_status)
 values(d.organization_id,d.id,d.attempts,case when d.status='dead_letter' then 'dead_letter' else 'retry' end,d.provider_code,v_error,p_http_status);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id);
end $$;

create function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.materialize_notification_delivery($1,$2,$3,$4,$5,$6,$7)$$;
create function api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer)
returns table(id uuid,organization_id uuid,outbox_event_id uuid,recipient_user_id uuid,channel text,template_code text,template_version text,destination text,variables jsonb,status text,attempts integer,lock_token uuid,lease_expires_at timestamptz)
language sql security definer set search_path=pg_catalog as $$select * from qarar_governance.claim_notification_deliveries($1,$2,$3,$4,$5)$$;
create function api_v1.service_complete_notification_delivery(uuid,uuid,text,text) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.complete_notification_delivery($1,$2,$3,$4)$$;
create function api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.fail_notification_delivery($1,$2,$3,$4,$5)$$;

alter function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb) owner to qarar_api_executor;
alter function api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer) owner to qarar_api_executor;
alter function api_v1.service_complete_notification_delivery(uuid,uuid,text,text) owner to qarar_api_executor;
alter function api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer) owner to qarar_api_executor;

alter function qarar_governance.mask_notification_destination(text) owner to qarar_governance_executor;
alter function qarar_governance.materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb) owner to qarar_governance_executor;
alter function qarar_governance.claim_notification_deliveries(uuid,uuid,text,integer,integer) owner to qarar_governance_executor;
alter function qarar_governance.complete_notification_delivery(uuid,uuid,text,text) owner to qarar_governance_executor;
alter function qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.mask_notification_destination(text),qarar_governance.materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),qarar_governance.claim_notification_deliveries(uuid,uuid,text,integer,integer),qarar_governance.complete_notification_delivery(uuid,uuid,text,text),qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer),api_v1.service_complete_notification_delivery(uuid,uuid,text,text),api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer),api_v1.service_complete_notification_delivery(uuid,uuid,text,text),api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('qarar_governance','api_v1') and p.proname in ('mask_notification_destination','materialize_notification_delivery','claim_notification_deliveries','complete_notification_delivery','fail_notification_delivery','service_materialize_notification_delivery','service_claim_notification_deliveries','service_complete_notification_delivery','service_fail_notification_delivery')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
 ('v1','service_materialize_notification_delivery','qarar_governance','materialize_notification_delivery','p_event_id uuid, p_lock_token uuid, p_channel text, p_template_code text, p_template_version text, p_destination text, p_variables jsonb','governance','service_role'),
 ('v1','service_claim_notification_deliveries','qarar_governance','claim_notification_deliveries','p_worker_id uuid, p_lock_token uuid, p_channel text, p_limit integer, p_lease_seconds integer','governance','service_role'),
 ('v1','service_complete_notification_delivery','qarar_governance','complete_notification_delivery','p_delivery_id uuid, p_lock_token uuid, p_provider_code text, p_provider_message_id text','governance','service_role'),
 ('v1','service_fail_notification_delivery','qarar_governance','fail_notification_delivery','p_delivery_id uuid, p_lock_token uuid, p_error_code text, p_provider_code text, p_http_status integer','governance','service_role')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
