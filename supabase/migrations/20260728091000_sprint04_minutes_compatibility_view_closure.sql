begin;

-- The physical tables were locked in PB-022, but their legacy public views
-- retained grants copied during the modular-schema migration.  They must not
-- expose an alternate frontend read or write path.
revoke all on public.meeting_minutes, public.minute_approvals
from public, anon, authenticated;

comment on view public.meeting_minutes is
  'Retired client surface. Use api_v1 minute contracts.';
comment on view public.minute_approvals is
  'Retired client surface. Use api_v1 minute contracts.';

commit;
