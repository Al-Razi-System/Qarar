-- Explicit provider client rejections must be terminal while known transient
-- statuses remain retryable.
begin;
create extension if not exists pgtap;
select plan(4);

select matches(
 (select prosrc from pg_proc where oid='qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer)'::regprocedure),
 'p_http_status between 400 and 499',
 'provider 4xx classification is explicit'
);
select matches(
 (select prosrc from pg_proc where oid='qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer)'::regprocedure),
 'not in \(408,425,429\)',
 'timeouts and rate limits remain retryable'
);
select matches(
 (select prosrc from pg_proc where oid='qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer)'::regprocedure),
 'when v_terminal then ''failed''',
 'terminal rejections become failed without retry'
);
select matches(
 (select prosrc from pg_proc where oid='qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer)'::regprocedure),
 'when d.status=''retry_wait'' then ''retry''',
 'attempt audit distinguishes retry from terminal failure'
);

select * from finish();
rollback;
