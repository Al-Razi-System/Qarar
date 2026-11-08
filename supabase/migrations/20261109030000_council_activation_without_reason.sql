-- Activating a council needs no reason; deactivating or archiving still does
-- (decision of the product owner, 9 November 2026). An activation without a reason is
-- recorded with a standard one, so the status history and the audit trail stay complete.
-- Impact map: docs/engineering/impact/COUNCIL_ACTIVATION_NO_REASON_20261109_AR.md
begin;

do $$
declare v_def text;v_new text;
  v_check text:='or nullif(btrim(p_reason),'''') is null
 then raise exception using errcode=''22023'',message=''الحالة والسبب مطلوبان'';end if;';
  v_stored text:='coalesce(nullif(btrim(p_reason),''''),''تفعيل المجلس'')';
begin
  v_def:=pg_get_functiondef('qarar_core.change_council_status(uuid,text,text,timestamptz)'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_check,'')))/length(v_check)<>1 then
    raise exception 'change_council_status reason check not found exactly once';
  end if;
  -- First the stored reason (it must exist for every history row), then the check, which
  -- keeps testing the reason as given.
  v_new:=replace(v_def,'btrim(p_reason)',v_stored);
  v_new:=replace(v_new,'or nullif('||v_stored||','''') is null','or (p_target_status<>''active'' and nullif(btrim(p_reason),'''') is null)');
  if v_new=v_def or position('p_target_status<>''active'' and nullif(btrim(p_reason)' in v_new)=0 then
    raise exception 'change_council_status was not rewritten as intended';
  end if;
  execute v_new;
end;
$$;

notify pgrst,'reload schema';
commit;
