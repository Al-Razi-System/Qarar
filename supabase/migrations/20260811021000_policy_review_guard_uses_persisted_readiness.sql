begin;

create or replace function qarar_governance.guard_policy_legislative_readiness()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
begin
  if old.legal_status='draft' and new.legal_status='under_review' then
    if old.automation_status<>'ready' or old.readiness_percent<>100 then
      raise exception using
        errcode='23514',
        message='النموذج التشريعي غير مكتمل؛ شغّل فحص الجاهزية وأصلح المتطلبات قبل الإرسال للمراجعة';
    end if;
  end if;
  return new;
end
$$;

alter function qarar_governance.guard_policy_legislative_readiness() owner to qarar_governance_executor;

commit;
