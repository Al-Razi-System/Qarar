-- Every signature must be cryptographically bound to the exact final text.
create or replace function qarar_minutes.ensure_final_content_hash()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.content_final is not null and btrim(new.content_final) <> '' then
    new.final_content_hash := encode(
      extensions.digest(convert_to(btrim(new.content_final), 'UTF8'), 'sha256'),
      'hex'
    );
  else
    new.final_content_hash := null;
  end if;
  return new;
end;
$$;

alter function qarar_minutes.ensure_final_content_hash()
  owner to qarar_minutes_executor;

drop trigger if exists meeting_minutes_bind_final_content on qarar_minutes.meeting_minutes;
create trigger meeting_minutes_bind_final_content
before insert or update of content_final on qarar_minutes.meeting_minutes
for each row execute function qarar_minutes.ensure_final_content_hash();

-- Repair final versions submitted before the invariant was introduced.
update qarar_minutes.meeting_minutes
set final_content_hash = encode(
  extensions.digest(convert_to(btrim(content_final), 'UTF8'), 'sha256'),
  'hex'
)
where content_final is not null
  and btrim(content_final) <> ''
  and final_content_hash is null;

select pg_notify('pgrst', 'reload schema');
