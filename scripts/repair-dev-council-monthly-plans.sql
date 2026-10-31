-- Development-only, explicitly approved cadence. Separate from schema migrations
-- and demo seeding. Run only after release gates; psql requires actor_user_id.
-- The authenticated institutional administrator is recorded as the repair actor.
-- Default is a rollback preview; use -v apply_repair=true only after verification.
\set ON_ERROR_STOP on
\if :{?apply_repair}
\else
\set apply_repair false
\endif
begin;
select set_config('qarar.repair_actor', :'actor_user_id', true);
select set_config('request.jwt.claims', jsonb_build_object(
 'sub', :'actor_user_id', 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $repair$
declare
 org constant uuid := '00000000-0000-0000-0000-000000000001';
 university constant uuid := '10000000-0000-0000-0000-000000000001';
 meeting_type constant uuid := '698319a3-7701-46e0-a622-f702f06c7965';
 today date := (clock_timestamp() at time zone 'Asia/Riyadh')::date;
 target_month date; window_value jsonb; c record; repaired integer := 0;
begin
 if not exists(select 1 from qarar_core.organizations where id=org and code='qarar-demo')
 or not exists(select 1 from qarar_iam.users where id=current_setting('qarar.repair_actor')::uuid
   and organization_id=org and status='active' and is_system_admin)
 or not exists(select 1 from qarar_meetings.meeting_types where id=meeting_type and organization_id=org and is_active)
 then raise exception 'Development repair prerequisites do not match'; end if;
 perform qarar_iam.assert_permission('governance.units.manage',null);
 -- Scope classification was inspected against the imported organizational tree.
 -- Unscoped historic councils and other university-wide administrative councils
 -- intentionally remain untouched. An existing plan always wins.
 for c in
  select council.*, case when scope_type.code='out_2026_000004' then 1
   when scope_type.code='out_2026_000001' then 2 else 3 end cadence_week
  from qarar_core.governance_units council
  join qarar_core.governance_unit_types council_type on council_type.id=council.unit_type_id
  join qarar_core.governance_units scope on scope.id=council.scope_unit_id and scope.organization_id=org
  join qarar_core.governance_unit_types scope_type on scope_type.id=scope.unit_type_id
  where council.organization_id=org and council_type.is_council_type and council.status<>'archived'
   and (scope_type.code in ('out_2026_000004','out_2026_000001')
    or (council.id=university and scope_type.code='out_2026_000003'))
  order by council.id
 loop
  perform 1 from qarar_core.governance_units where id=c.id for update;
  if exists(select 1 from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=c.id and organization_id=org) then continue;end if;
  target_month:=date_trunc('month',today)::date;
  window_value:=qarar_meetings.council_month_week_window_v2(target_month,c.cadence_week);
  if (window_value->>'ends_on')::date<today then target_month:=(target_month+interval '1 month')::date;end if;
  perform api_v2.admin_update_council_v2(c.id,jsonb_build_object(
   'name_ar',c.name_ar,'name_en',c.name_en,'description',c.description,'unit_type_id',c.unit_type_id,
   'governance_class_id',c.governance_class_id,'minimum_active_members',c.minimum_active_members,
   'allow_dual_leadership',c.allow_dual_leadership),c.updated_at,jsonb_build_object(
   'meeting_type_id',meeting_type,'recurrence','monthly','monthly_week',c.cadence_week,
   'first_meeting_date',target_month));
  perform qarar_audit.append_audit_log(org,'council.monthly_plan.repaired','governance_unit',c.id,
   jsonb_build_object('source','approved-development-repair','monthly_week',c.cadence_week));
  repaired:=repaired+1;
 end loop;
 raise notice 'Prepared % council plans; no existing plan was changed',repaired;
end $repair$;
select p.monthly_week,count(*) plans,count(m.id) drafts
from qarar_meetings.council_meeting_plans_v2 p
left join qarar_meetings.meetings m on m.source_plan_id=p.id
where p.organization_id='00000000-0000-0000-0000-000000000001' and p.monthly_week is not null
group by p.monthly_week order by p.monthly_week;
\if :apply_repair
commit;
\else
rollback;
\endif
