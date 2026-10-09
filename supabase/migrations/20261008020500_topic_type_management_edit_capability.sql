begin;
-- Explicit author-scoped edit capability. Existing draft command remains the
-- final authority and checks ownership, status and optimistic concurrency.
create or replace function qarar_governance.list_governance_topic_types_v2(p_search text default '',p_status text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.read',null);
 if p_page is null or p_page<1 or p_page>100000 or length(p_search)>300
 or p_status not in ('','draft','under_review','changes_requested','approved','effective','retired') then
  raise exception using errcode='22023',message='معايير البحث غير صالحة';
 end if;
 with latest as (
  select distinct on (t.id) t.id,t.name_ar,t.reference_number,c.name_ar classification_name,b.id bundle_id,b.status,b.updated_at,v.version_no,
   (b.status in ('draft','changes_requested') and b.created_by_user_id=auth.uid() and qarar_iam.has_permission('governance.model.edit',null)
    and exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 ap where ap.topic_type_version_id=v.id and ap.organization_id=v.organization_id)) can_edit
  from qarar_governance.topic_types_v2 t
  join qarar_governance.topic_type_versions_v2 v on v.topic_type_id=t.id and v.organization_id=t.organization_id
  join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=v.id and b.organization_id=v.organization_id
  join qarar_governance.topic_classifications_v2 c on c.id=v.classification_id and c.organization_id=v.organization_id
  where t.organization_id=o order by t.id,v.version_no desc
 ), filtered as (
  select * from latest where (p_status='' or status=p_status)
  and (p_search='' or strpos(lower(name_ar),lower(p_search))>0 or strpos(lower(reference_number),lower(p_search))>0)
 ), page as (select * from filtered order by updated_at desc,id limit 20 offset ((p_page-1)*20))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by updated_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from filtered),'page',p_page,'page_size',20) into result;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
