begin;
CREATE OR REPLACE FUNCTION qarar_iam.get_user_submission_scope_v2(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then raise exception using errcode='42501',message='إدارة نطاق التقديم متاحة لمدير النظام فقط'; end if;
 if not exists(select 1 from qarar_iam.users where id=p_user_id and organization_id=o) then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 select jsonb_build_object('user_name_ar',(select full_name_ar from qarar_iam.users where id=p_user_id and organization_id=o),'revision',coalesce(p.revision,0),'home_unit_id',p.home_unit_id,
 'rules',coalesce((select jsonb_agg(jsonb_build_object('kind',case when g.council_id is null then 'class' else 'council' end,'target_id',coalesce(g.council_id,g.class_id),'include_descendants',g.include_descendants) order by g.created_at,g.id) from qarar_iam.user_submission_grants_v2 g where g.user_id=p_user_id and g.organization_id=o and g.is_active),'[]'::jsonb)) into result
 from (select 1) x left join qarar_iam.user_submission_profiles_v2 p on p.user_id=p_user_id and p.organization_id=o;
 return result||jsonb_build_object(
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'parent_unit_id',u.parent_unit_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and not t.is_council_type),'[]'::jsonb),
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'scope_unit_id',u.scope_unit_id,'class_id',u.governance_class_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and t.is_council_type),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar) from qarar_governance.governance_unit_classes where organization_id=o and is_active),'[]'::jsonb));
end $function$;
commit;
