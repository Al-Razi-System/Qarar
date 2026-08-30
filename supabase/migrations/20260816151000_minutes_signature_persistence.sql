begin;

alter table qarar_minutes.meeting_minutes
  add column if not exists final_content_hash text;

alter table qarar_minutes.minute_approvals
  add column if not exists signature_strokes jsonb,
  add column if not exists signature_hash text,
  add column if not exists signed_content_hash text,
  add column if not exists signed_at timestamptz;

comment on column qarar_minutes.meeting_minutes.final_content_hash is
  'Digest of the final minutes content used to bind member signatures.';
comment on column qarar_minutes.minute_approvals.signature_strokes is
  'Captured signature strokes for an approved minutes record.';
comment on column qarar_minutes.minute_approvals.signed_content_hash is
  'Minutes content digest acknowledged by the signer.';

commit;
