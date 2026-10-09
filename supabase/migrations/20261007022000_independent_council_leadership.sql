begin;

-- Null means preserve the existing role, never terminate it implicitly.
create or replace function qarar_iam.admin_assign_council_leadership_pair(
 p_council_id uuid,p_chair_user_id uuid,p_rapporteur_user_id uuid,
 p_effective_date date,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare chair_result jsonb;rapporteur_result jsonb;changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.leadership.assign',p_council_id);
 if p_chair_user_id is null and p_rapporteur_user_id is null then
  raise exception using errcode='22023',message='اختر الرئيس أو المقرر لتعيينه';
 end if;
 if p_chair_user_id is not null then
  chair_result:=qarar_iam.admin_assign_council_leadership(
   p_council_id,'council_chair',p_chair_user_id,p_effective_date,p_reason,p_expected_updated_at);
 end if;
 if p_rapporteur_user_id is not null then
  rapporteur_result:=qarar_iam.admin_assign_council_leadership(
   p_council_id,'council_rapporteur',p_rapporteur_user_id,p_effective_date,p_reason,p_expected_updated_at);
 end if;
 changed:=qarar_core.touch_council_leadership_version(p_council_id,p_expected_updated_at);
 return jsonb_build_object('governance_unit_id',p_council_id,'chair',chair_result,
  'rapporteur',rapporteur_result,'effective_date',p_effective_date,'updated_at',changed,'atomic',true);
end $$;
alter function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 owner to qarar_iam_executor;
revoke all on function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 to qarar_api_executor;
commit;
