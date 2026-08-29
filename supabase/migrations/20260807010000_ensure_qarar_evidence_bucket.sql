begin;

-- The storage schema may be initialised after the core schema on an existing
-- local stack.  Keep the regulation evidence bucket available on every
-- migration run without changing existing bucket configuration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qarar-evidence',
  'qarar-evidence',
  false,
  26214400,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

commit;
