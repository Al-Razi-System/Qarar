-- Audit log: request context, readable before/after, denied and failed attempts, an honest
-- append-only guarantee, and reads that name the record each event touched.
-- Impact map: docs/engineering/impact/AUDIT_LOG_CONTEXT_AND_INTEGRITY_20261112_AR.md
begin;

-- 1. Context columns. Existing rows keep their values; nothing historical is rewritten.
alter table qarar_audit.audit_logs
  add column request_id text,
  add column client_ip inet,
  add column user_agent text,
  add column actor_kind text,
  add column changed_fields text[];
alter table qarar_audit.audit_logs
  add constraint audit_logs_actor_kind_check check (actor_kind is null or actor_kind in ('user','service','system')),
  add constraint audit_logs_request_id_check check (request_id is null or request_id ~ '^[A-Za-z0-9._:-]{1,100}$');
create index idx_audit_logs_org_result_time on qarar_audit.audit_logs(organization_id, result, occurred_at desc) where result <> 'success';
create index idx_audit_logs_org_actor_time on qarar_audit.audit_logs(organization_id, actor_user_id, occurred_at desc);

-- Fields whose difference is bookkeeping, not a decision.
create function qarar_audit.changed_keys(p_old jsonb, p_new jsonb)
returns text[] language sql immutable set search_path=pg_catalog
as $$
  select case when jsonb_typeof(p_old)='object' and jsonb_typeof(p_new)='object' then
    coalesce((select array_agg(k order by k) from (
      select k from jsonb_object_keys(p_old) k union select k from jsonb_object_keys(p_new) k) keys
      where p_old->k is distinct from p_new->k), '{}'::text[])
  end
$$;

-- 2. Every writer passes through here: append_audit_log, the row-change trigger and the
-- functions that insert directly.
create function qarar_audit.enrich_audit_log()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_headers jsonb;
  v_ip text;
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true),''), auth.jwt()->>'role');
begin
  begin
    v_headers := nullif(current_setting('request.headers', true),'')::jsonb;
  exception when others then v_headers := null;
  end;

  if NEW.request_id is null and (v_headers->>'x-qarar-request-id') ~ '^[A-Za-z0-9._:-]{1,100}$' then
    NEW.request_id := v_headers->>'x-qarar-request-id';
  end if;
  if NEW.client_ip is null then
    -- The dashboard forwards the address its reverse proxy saw; otherwise the first forwarded hop.
    v_ip := coalesce(nullif(btrim(v_headers->>'x-qarar-client-ip'),''), nullif(btrim(split_part(v_headers->>'x-forwarded-for', ',', 1)),''), nullif(btrim(v_headers->>'x-real-ip'),''));
    if v_ip ~ '^[0-9A-Fa-f:.]{2,45}$' then
      begin NEW.client_ip := v_ip::inet; exception when others then NEW.client_ip := null; end;
    end if;
  end if;
  if NEW.user_agent is null then
    NEW.user_agent := left(nullif(btrim(coalesce(v_headers->>'x-qarar-user-agent', v_headers->>'user-agent')),''), 500);
  end if;
  NEW.actor_kind := case
    when NEW.actor_user_id is not null then 'user'
    when v_role = 'service_role' then 'service'
    else 'system' end;

  if (NEW.metadata ? 'old' or NEW.metadata ? 'new') and NEW.previous_data is null and NEW.new_data is null then
    NEW.previous_data := nullif(NEW.metadata->'old', 'null'::jsonb);
    NEW.new_data := nullif(NEW.metadata->'new', 'null'::jsonb);
    NEW.metadata := NEW.metadata - 'old' - 'new';
  end if;
  if NEW.changed_fields is null then
    NEW.changed_fields := qarar_audit.changed_keys(NEW.previous_data, NEW.new_data);
  end if;
  return NEW;
end;
$$;

-- 3. Append-only. The one permitted change is the foreign key detaching a deleted actor.
create function qarar_audit.reject_audit_change()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  if TG_OP = 'UPDATE' and NEW.actor_user_id is null and OLD.actor_user_id is not null
     and (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') then
    return NEW;
  end if;
  raise exception 'audit log is append-only' using errcode = '42501';
end;
$$;

create trigger enrich_audit_log before insert on qarar_audit.audit_logs
  for each row execute function qarar_audit.enrich_audit_log();
create trigger audit_logs_append_only before update or delete on qarar_audit.audit_logs
  for each row execute function qarar_audit.reject_audit_change();
create trigger audit_logs_no_truncate before truncate on qarar_audit.audit_logs
  for each statement execute function qarar_audit.reject_audit_change();
revoke update, delete, truncate on qarar_audit.audit_logs
  from postgres, service_role, qarar_audit_executor, qarar_governance_executor;

-- 4. Name the record an event touched. Column-level reads only: number and title, nothing else.
grant usage on schema qarar_core, qarar_topics, qarar_meetings, qarar_decisions, qarar_execution, qarar_governance, qarar_voting
  to qarar_audit_executor;
grant select (id, organization_id, topic_no, title_ar) on qarar_topics.topics to qarar_audit_executor;
grant select (id, organization_id, meeting_no, title_ar) on qarar_meetings.meetings to qarar_audit_executor;
grant select (id, organization_id, meeting_id, topic_id) on qarar_meetings.agenda_items to qarar_audit_executor;
grant select (id, organization_id, title_ar) on qarar_meetings.meeting_assignments to qarar_audit_executor;
grant select (id, organization_id, decision_no, topic_id) on qarar_decisions.decisions to qarar_audit_executor;
grant select (id, organization_id, action_no, title_ar) on qarar_execution.action_items to qarar_audit_executor;
grant select (id, organization_id, reference_number, name_ar) on qarar_core.governance_units to qarar_audit_executor;
grant select (id, organization_id, reference_number, name_ar) on qarar_governance.policies to qarar_audit_executor;
grant select (id, organization_id, reference_number, name_ar) on qarar_governance.topic_types_v2 to qarar_audit_executor;
grant select (id, organization_id, reference_number, name_ar) on qarar_governance.workflow_templates to qarar_audit_executor;
grant select (id, organization_id, round_number, meeting_id) on qarar_voting.voting_rounds to qarar_audit_executor;
grant select (id, organization_id, code, name_ar) on qarar_iam.roles to qarar_audit_executor;
grant select (id, organization_id, user_id, governance_unit_id) on qarar_iam.memberships to qarar_audit_executor;
grant select (id, organization_id, user_id, device_name) on qarar_iam.user_sessions to qarar_audit_executor;

create function qarar_audit.entity_label(p_org uuid, p_entity_type text, p_entity_id uuid, p_snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_ref text; v_title text;
begin
  if p_entity_id is not null then
    case p_entity_type
      when 'topics' then select t.topic_no, t.title_ar into v_ref, v_title from qarar_topics.topics t where t.id=p_entity_id and t.organization_id=p_org;
      when 'meetings' then select m.meeting_no, m.title_ar into v_ref, v_title from qarar_meetings.meetings m where m.id=p_entity_id and m.organization_id=p_org;
      when 'agenda_items', 'agenda_item' then
        select m.meeting_no, t.title_ar into v_ref, v_title from qarar_meetings.agenda_items a
        left join qarar_meetings.meetings m on m.id=a.meeting_id left join qarar_topics.topics t on t.id=a.topic_id
        where a.id=p_entity_id and a.organization_id=p_org;
      when 'meeting_assignments' then select null, x.title_ar into v_ref, v_title from qarar_meetings.meeting_assignments x where x.id=p_entity_id and x.organization_id=p_org;
      when 'decisions' then
        select d.decision_no, t.title_ar into v_ref, v_title from qarar_decisions.decisions d left join qarar_topics.topics t on t.id=d.topic_id
        where d.id=p_entity_id and d.organization_id=p_org;
      when 'action_items' then select x.action_no, x.title_ar into v_ref, v_title from qarar_execution.action_items x where x.id=p_entity_id and x.organization_id=p_org;
      when 'governance_units', 'governance_unit' then select x.reference_number, x.name_ar into v_ref, v_title from qarar_core.governance_units x where x.id=p_entity_id and x.organization_id=p_org;
      when 'policies' then select x.reference_number, x.name_ar into v_ref, v_title from qarar_governance.policies x where x.id=p_entity_id and x.organization_id=p_org;
      when 'topic_types_v2' then select x.reference_number, x.name_ar into v_ref, v_title from qarar_governance.topic_types_v2 x where x.id=p_entity_id and x.organization_id=p_org;
      when 'workflow_templates' then select x.reference_number, x.name_ar into v_ref, v_title from qarar_governance.workflow_templates x where x.id=p_entity_id and x.organization_id=p_org;
      when 'voting_rounds' then
        select m.meeting_no, 'جولة '||r.round_number into v_ref, v_title from qarar_voting.voting_rounds r left join qarar_meetings.meetings m on m.id=r.meeting_id
        where r.id=p_entity_id and r.organization_id=p_org;
      when 'roles' then select x.code, x.name_ar into v_ref, v_title from qarar_iam.roles x where x.id=p_entity_id and x.organization_id=p_org;
      when 'users' then select x.employee_no, x.full_name_ar into v_ref, v_title from qarar_iam.users x where x.id=p_entity_id and x.organization_id=p_org;
      when 'memberships', 'membership' then
        select g.name_ar, u.full_name_ar into v_ref, v_title from qarar_iam.memberships x
        left join qarar_iam.users u on u.id=x.user_id left join qarar_core.governance_units g on g.id=x.governance_unit_id
        where x.id=p_entity_id and x.organization_id=p_org;
      when 'user_sessions' then
        select x.device_name, u.full_name_ar into v_ref, v_title from qarar_iam.user_sessions x left join qarar_iam.users u on u.id=x.user_id
        where x.id=p_entity_id and x.organization_id=p_org;
      else null;
    end case;
  end if;
  -- A deleted record is still named from the snapshot the event kept.
  if v_ref is null and v_title is null and jsonb_typeof(p_snapshot)='object' then
    v_ref := coalesce(p_snapshot->>'topic_no', p_snapshot->>'meeting_no', p_snapshot->>'action_no', p_snapshot->>'decision_no', p_snapshot->>'reference_number', p_snapshot->>'employee_no');
    v_title := coalesce(p_snapshot->>'title_ar', p_snapshot->>'name_ar', p_snapshot->>'full_name_ar', p_snapshot->>'device_name');
  end if;
  if v_ref is null and v_title is null then return null; end if;
  return jsonb_build_object('reference', v_ref, 'title', v_title);
end;
$$;

-- 5. Reads: same signatures, additional fields only. Legacy rows fall back to metadata.old/new.
create or replace function qarar_audit.admin_search_audit_logs(
  p_query text default null, p_action text default null, p_entity_type text default null, p_actor_user_id uuid default null,
  p_result text default null, p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_query text := nullif(btrim(p_query),'');
begin
  perform qarar_iam.assert_permission('audit.logs.read');
  if p_result is not null and p_result not in ('success','failure','denied') then raise exception 'invalid audit result' using errcode='22023'; end if;
  return (
    with matched as (
      select a.*, u.full_name_ar as actor_name_ar, u.email as actor_email
      from qarar_audit.audit_logs a
      left join qarar_iam.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
      where a.organization_id=v_org
        and (p_action is null or a.action=p_action)
        and (p_entity_type is null or a.entity_type=p_entity_type)
        and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id)
        and (p_result is null or a.result=p_result)
        and (p_from is null or a.occurred_at>=p_from)
        and (p_to is null or a.occurred_at<p_to)
        and (v_query is null or a.action ilike '%'||v_query||'%' or a.entity_type ilike '%'||v_query||'%'
             or u.full_name_ar ilike '%'||v_query||'%' or u.email ilike '%'||v_query||'%'
             or a.request_id = v_query or a.entity_id::text = v_query or a.metadata::text ilike '%'||v_query||'%')
    ), page as (
      select * from matched order by occurred_at desc limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'organization_id', p.organization_id, 'action', p.action, 'entity_type', p.entity_type, 'entity_id', p.entity_id,
          'result', p.result, 'occurred_at', p.occurred_at,
          'actor_user_id', p.actor_user_id, 'actor_name_ar', p.actor_name_ar, 'actor_email', p.actor_email,
          'actor_kind', coalesce(p.actor_kind, case when p.actor_user_id is not null then 'user' else 'system' end),
          'request_id', p.request_id, 'client_ip', host(p.client_ip),
          'changed_fields', coalesce(p.changed_fields, qarar_audit.changed_keys(p.metadata->'old', p.metadata->'new')),
          'entity_label', qarar_audit.entity_label(p.organization_id, p.entity_type, p.entity_id, coalesce(p.new_data, p.previous_data, p.metadata->'new', p.metadata->'old')),
          'metadata', p.metadata - 'old' - 'new')
        order by p.occurred_at desc) from page p), '[]'::jsonb),
      'total', (select count(*) from matched),
      'limit', v_limit, 'offset', v_offset)
  );
end;
$$;

create or replace function qarar_audit.admin_get_audit_log(p_audit_log_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_result jsonb;
begin
  perform qarar_iam.assert_permission('audit.logs.read');
  select jsonb_build_object(
      'id', a.id, 'organization_id', a.organization_id, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
      'result', a.result, 'occurred_at', a.occurred_at,
      'actor_user_id', a.actor_user_id, 'actor_name_ar', u.full_name_ar, 'actor_email', u.email,
      'actor_kind', coalesce(a.actor_kind, case when a.actor_user_id is not null then 'user' else 'system' end),
      'request_id', a.request_id, 'client_ip', host(a.client_ip), 'user_agent', a.user_agent,
      'previous_data', coalesce(a.previous_data, nullif(a.metadata->'old','null'::jsonb)),
      'new_data', coalesce(a.new_data, nullif(a.metadata->'new','null'::jsonb)),
      'changed_fields', coalesce(a.changed_fields, qarar_audit.changed_keys(a.metadata->'old', a.metadata->'new')),
      'entity_label', qarar_audit.entity_label(a.organization_id, a.entity_type, a.entity_id, coalesce(a.new_data, a.previous_data, a.metadata->'new', a.metadata->'old')),
      'metadata', a.metadata - 'old' - 'new')
    into v_result
  from qarar_audit.audit_logs a
  left join qarar_iam.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
  where a.id=p_audit_log_id and a.organization_id=qarar_iam.current_organization_id();
  if v_result is null then raise exception 'audit log not found'; end if;
  return v_result;
end;
$$;

create function qarar_audit.admin_get_audit_facets()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('audit.logs.read');
  return jsonb_build_object(
    'entity_types', coalesce((select jsonb_agg(jsonb_build_object('value', entity_type, 'count', c) order by c desc)
      from (select entity_type, count(*) c from qarar_audit.audit_logs where organization_id=v_org group by entity_type) e), '[]'::jsonb),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', x.actor_user_id, 'name_ar', u.full_name_ar, 'count', x.c) order by x.c desc)
      from (select actor_user_id, count(*) c from qarar_audit.audit_logs where organization_id=v_org and actor_user_id is not null
            group by actor_user_id order by count(*) desc limit 200) x
      join qarar_iam.users u on u.id=x.actor_user_id and u.organization_id=v_org), '[]'::jsonb),
    'results', coalesce((select jsonb_object_agg(result, c) from (select result, count(*) c from qarar_audit.audit_logs where organization_id=v_org group by result) r), '{}'::jsonb));
end;
$$;

-- 6. Denied and failed attempts. A rejected command rolls back its own transaction, so the
-- dashboard reports the outcome here, in a separate one, as the service.
create function qarar_audit.service_record_api_outcome(
  p_actor_user_id uuid, p_api_version text, p_contract text, p_result text, p_error_code text, p_http_status integer)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid; v_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true),''), auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_result not in ('denied','failure') then raise exception 'invalid outcome' using errcode='22023'; end if;
  if p_contract !~ '^[a-z][a-z0-9_]{0,79}$' or coalesce(p_api_version,'') !~ '^v[0-9]{1,2}$'
     or coalesce(p_error_code,'') !~ '^[A-Za-z0-9_]{0,20}$' or p_http_status not between 100 and 599 then
    raise exception 'invalid outcome descriptor' using errcode='22023';
  end if;
  select u.organization_id into v_org from qarar_iam.users u where u.id=p_actor_user_id;
  if v_org is null then raise exception 'unknown actor' using errcode='22023'; end if;
  insert into qarar_audit.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, result, metadata)
  values (v_org, p_actor_user_id, 'api.'||case p_result when 'denied' then 'denied' else 'failed' end, 'api_contract', null, p_result,
    jsonb_build_object('contract', p_contract, 'api_version', p_api_version, 'error_code', nullif(p_error_code,''), 'http_status', p_http_status))
  returning id into v_id;
  return v_id;
end;
$$;

alter function qarar_audit.changed_keys(jsonb,jsonb) owner to qarar_audit_executor;
alter function qarar_audit.enrich_audit_log() owner to qarar_audit_executor;
alter function qarar_audit.entity_label(uuid,text,uuid,jsonb) owner to qarar_audit_executor;
alter function qarar_audit.admin_get_audit_facets() owner to qarar_audit_executor;
alter function qarar_audit.service_record_api_outcome(uuid,text,text,text,text,integer) owner to qarar_audit_executor;
revoke all on function qarar_audit.changed_keys(jsonb,jsonb), qarar_audit.enrich_audit_log(), qarar_audit.reject_audit_change(),
  qarar_audit.entity_label(uuid,text,uuid,jsonb), qarar_audit.admin_get_audit_facets(),
  qarar_audit.service_record_api_outcome(uuid,text,text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function qarar_audit.admin_get_audit_facets(), qarar_audit.service_record_api_outcome(uuid,text,text,text,text,integer)
  to qarar_api_executor;

create function api_v1.admin_get_audit_facets()
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_audit.admin_get_audit_facets() $$;
create function api_v1.service_record_api_outcome(
  p_actor_user_id uuid, p_api_version text, p_contract text, p_result text, p_error_code text, p_http_status integer)
returns uuid language sql security definer set search_path=pg_catalog
as $$ select qarar_audit.service_record_api_outcome($1,$2,$3,$4,$5,$6) $$;
alter function api_v1.admin_get_audit_facets() owner to qarar_api_executor;
alter function api_v1.service_record_api_outcome(uuid,text,text,text,text,integer) owner to qarar_api_executor;
revoke all on function api_v1.admin_get_audit_facets() from public, anon, service_role;
revoke all on function api_v1.service_record_api_outcome(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function api_v1.admin_get_audit_facets() to authenticated;
grant execute on function api_v1.service_record_api_outcome(uuid,text,text,text,text,integer) to service_role;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','admin_get_audit_facets','qarar_audit','admin_get_audit_facets','','audit','authenticated'),
('v1','service_record_api_outcome','qarar_audit','service_record_api_outcome',
  'p_actor_user_id uuid, p_api_version text, p_contract text, p_result text, p_error_code text, p_http_status integer','audit','service_role');

notify pgrst, 'reload schema';
commit;
