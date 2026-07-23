-- Quorum snapshots created in one transaction still need deterministic temporal ordering.

alter table public.quorum_snapshots
alter column calculated_at set default clock_timestamp();
