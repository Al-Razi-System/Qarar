-- A task evidence description is optional in the API and UI. The original
-- function converted an omitted description to NULL although the persisted
-- column is intentionally NOT NULL. Keep the column invariant and store an
-- omitted description as the empty string.
create or replace function qarar_execution.add_task_evidence(
  p_task_id uuid, p_file_name text, p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_description text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  t qarar_execution.action_items%rowtype;
  v_object record;
  v_id uuid;
begin
  select * into t from qarar_execution.action_items
  where id = p_task_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if t.id is null then
    raise exception using errcode = 'P0002', message = 'المهمة غير موجودة.';
  end if;
  perform qarar_execution.require_executor(t);
  if p_storage_path is null or p_storage_path not like 'tasks/' || t.id::text || '/%' or p_storage_path like '%..%' then
    raise exception using errcode = '22023', message = 'مسار الدليل لا يتبع هذه المهمة.';
  end if;
  if p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255
     or char_length(coalesce(p_description, '')) > 500 then
    raise exception using errcode = '22023', message = 'اسم الملف أو وصفه غير صالح.';
  end if;
  select name, metadata into v_object from storage.objects where bucket_id = 'qarar-evidence' and name = p_storage_path;
  if v_object.name is null
     or coalesce((v_object.metadata->>'size')::bigint, -1) <> p_file_size_bytes
     or coalesce(v_object.metadata->>'mimetype', '') <> p_mime_type then
    raise exception using errcode = '23514', message = 'لم يُعثر على الملف في المخزن، أو لا يطابق بياناته؛ أعد رفعه.';
  end if;
  insert into qarar_execution.action_evidence(
    organization_id, action_item_id, evidence_type, description, file_name,
    storage_path, uploaded_by_user_id, mime_type, file_size_bytes
  ) values (
    t.organization_id, t.id, 'document', btrim(coalesce(p_description, '')),
    btrim(p_file_name), p_storage_path, auth.uid(), p_mime_type, p_file_size_bytes
  ) returning id into v_id;
  update qarar_execution.action_items set updated_at = clock_timestamp()
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'evidence_added', null, btrim(p_file_name));
  return jsonb_build_object('id', v_id, 'action_item_id', t.id, 'updated_at', t.updated_at);
end;
$$;

comment on function qarar_execution.add_task_evidence(uuid,text,text,text,bigint,text)
is 'Registers executor evidence after private-storage verification; an omitted optional description is persisted as an empty string.';
