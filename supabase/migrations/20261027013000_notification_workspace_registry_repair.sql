-- Register the replacement workspace implementation created after the previous
-- implementation was retained as a compatibility base.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p
where p.oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure
on conflict(function_oid) do update set
  function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,
  owning_schema=excluded.owning_schema,
  is_rls_predicate=false;

commit;
