begin;
create extension if not exists pgtap;
select plan(16);

select has_function('api_v1','update_agenda_discussion',array['uuid','text','text','timestamp with time zone'],'agenda discussion API exists');
select has_function('api_v1','complete_meeting_session',array['uuid','timestamp with time zone'],'session completion API exists');
select has_function('api_v1','send_meeting_invitations',array['uuid','timestamp with time zone'],'meeting invitations API exists');
select has_function('api_v1','get_meeting_readiness',array['uuid'],'meeting readiness API exists');
select has_function('api_v1','get_meeting_minutes',array['uuid'],'minutes read API exists');
select has_function('api_v1','save_meeting_minutes_draft',array['uuid','text','timestamp with time zone'],'minutes draft API exists');
select has_function('api_v1','submit_meeting_minutes',array['uuid','text','timestamp with time zone'],'minutes submission API exists');
select has_function('api_v1','respond_meeting_minutes_approval',array['uuid','text','text','timestamp with time zone'],'minutes approval API exists');

select ok(has_function_privilege('authenticated','api_v1.update_agenda_discussion(uuid,text,text,timestamptz)','EXECUTE'),'authenticated can use discussion API');
select ok(not has_function_privilege('anon','api_v1.update_agenda_discussion(uuid,text,text,timestamptz)','EXECUTE'),'anonymous cannot use discussion API');
select ok(not has_function_privilege('anon','api_v1.send_meeting_invitations(uuid,timestamptz)','EXECUTE'),'anonymous cannot send invitations');
select ok(not has_function_privilege('anon','api_v1.get_meeting_readiness(uuid)','EXECUTE'),'anonymous cannot read meeting readiness');
select ok(has_function_privilege('authenticated','api_v1.get_meeting_minutes(uuid)','EXECUTE'),'authenticated can use minutes read API');
select ok(not has_function_privilege('anon','api_v1.get_meeting_minutes(uuid)','EXECUTE'),'anonymous cannot use minutes read API');
select ok(not has_function_privilege('authenticated','qarar_minutes.save_meeting_minutes_draft(uuid,text,timestamptz)','EXECUTE'),'clients cannot bypass minutes facade');
select ok(not exists(select 1 from pg_trigger where tgname in('trigger_on_minute_ready','trigger_on_approval_status_change') and not tgisinternal),'prototype direct-table triggers retired');

select * from finish();
rollback;
