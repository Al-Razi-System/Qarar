begin;
-- The catalogue is constant data, but every registered module function must
-- execute under its explicitly constrained owner, like the other IAM helpers.
alter function qarar_iam.system_permission_catalog() security definer;
commit;
