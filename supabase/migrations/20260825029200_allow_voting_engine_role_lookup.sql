begin;

-- Closing a tied round must resolve the council chair's vote. The voting
-- executor needs read-only access to the role catalogue for that lookup.
grant select on table qarar_iam.roles to qarar_voting_executor;

commit;
