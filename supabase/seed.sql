-- Development-only seed data for local Supabase.
-- This file intentionally avoids auth.users records and secrets.

insert into public.organizations (id, code, name_ar, name_en, sector)
values (
  '00000000-0000-0000-0000-000000000001',
  'qarar-demo',
  'مؤسسة قرار التجريبية',
  'Qarar Demo Organization',
  'governance'
)
on conflict (code) do nothing;

insert into qarar_core.governance_unit_types (
  organization_id, code, name_ar, name_en, description, is_council_type, is_system
)
values
  ('00000000-0000-0000-0000-000000000001', 'council', 'مجلس', 'Council', 'وحدة حوكمية تصدر قرارات رسمية', true, true),
  ('00000000-0000-0000-0000-000000000001', 'committee', 'لجنة', 'Committee', 'وحدة حوكمية فرعية أو متخصصة', true, true),
  ('00000000-0000-0000-0000-000000000001', 'department', 'إدارة', 'Department', 'وحدة تنظيمية أو تنفيذية', false, true)
on conflict (organization_id, code) do update set
 is_council_type=excluded.is_council_type,is_system=excluded.is_system;

insert into qarar_governance.governance_unit_classes (
  id,
  organization_id,
  code,
  name_ar,
  name_en,
  governance_level,
  description
)
values
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'university_council',
    'مجلس جامعة',
    'University Council',
    'university',
    'تصنيف للمجلس الأعلى على مستوى الجامعة'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'faculty_council',
    'مجلس كلية',
    'Faculty Council',
    'faculty',
    'تصنيف لمجالس الكليات'
  ),
  (
    '10000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    'department_council',
    'مجلس قسم',
    'Department Council',
    'department',
    'تصنيف لمجالس الأقسام العلمية'
  )
on conflict (organization_id, code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    governance_level = excluded.governance_level,
    description = excluded.description,
    is_active = true;

insert into public.governance_units (
  id,
  organization_id,
  unit_type_id,
  code,
  name_ar,
  name_en,
  level_no,
  status
)
select
  values_to_insert.id,
  values_to_insert.organization_id,
  unit_type.id,
  values_to_insert.code,
  values_to_insert.name_ar,
  values_to_insert.name_en,
  1,
  'active'
from (
  values
    (
      '10000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'council',
      'university_council',
      'مجلس الجامعة',
      'University Council'
    ),
    (
      '10000000-0000-0000-0000-000000000011'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'council',
      'faculty_science_council',
      'مجلس كلية العلوم',
      'Faculty of Science Council'
    ),
    (
      '10000000-0000-0000-0000-000000000012'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'council',
      'department_cs_council',
      'مجلس قسم الحاسب',
      'Computer Science Department Council'
    ),
    (
      '10000000-0000-0000-0000-000000000003'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'department',
      'general_administration',
      'الإدارة العامة',
      'General Administration'
    )
) as values_to_insert(id, organization_id, unit_type_code, code, name_ar, name_en)
join public.governance_unit_types unit_type
  on unit_type.organization_id = values_to_insert.organization_id
 and unit_type.code = values_to_insert.unit_type_code
on conflict (organization_id, code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    status = excluded.status;

update qarar_core.governance_units
set governance_class_id = '10000000-0000-0000-0000-000000000101',
    level_no = 1
where organization_id = '00000000-0000-0000-0000-000000000001'
  and code = 'university_council';

update qarar_core.governance_units
set parent_unit_id = '10000000-0000-0000-0000-000000000001',
    governance_class_id = '10000000-0000-0000-0000-000000000102',
    level_no = 2
where organization_id = '00000000-0000-0000-0000-000000000001'
  and code = 'faculty_science_council';

update qarar_core.governance_units
set parent_unit_id = '10000000-0000-0000-0000-000000000011',
    governance_class_id = '10000000-0000-0000-0000-000000000103',
    level_no = 3
where organization_id = '00000000-0000-0000-0000-000000000001'
  and code = 'department_cs_council';

insert into public.roles (organization_id, code, name_ar, name_en, role_scope)
values
  ('00000000-0000-0000-0000-000000000001', 'governance_admin', 'مسؤول الحوكمة', 'Governance Admin', 'organization'),
  ('00000000-0000-0000-0000-000000000001', 'council_chair', 'رئيس المجلس', 'Council Chair', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'council_rapporteur', 'مقرر المجلس', 'Council Rapporteur', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'council_member', 'عضو المجلس', 'Council Member', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'decision_executor', 'منفذ القرار', 'Decision Executor', 'execution'),
  ('00000000-0000-0000-0000-000000000001', 'follow_up_officer', 'جهة المتابعة', 'Follow-up Officer', 'execution'),
  ('00000000-0000-0000-0000-000000000001', 'internal_auditor', 'مراجع داخلي', 'Internal Auditor', 'organization')
on conflict (organization_id, code) do update
set name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    role_scope = excluded.role_scope,
    is_active = true;

insert into public.topic_categories (organization_id, code, name_ar, name_en)
values
  ('00000000-0000-0000-0000-000000000001', 'administrative', 'إداري', 'Administrative'),
  ('00000000-0000-0000-0000-000000000001', 'academic_plan', 'خطة أكاديمية', 'Academic Plan'),
  ('00000000-0000-0000-0000-000000000001', 'quality', 'جودة وامتثال', 'Quality and Compliance'),
  ('00000000-0000-0000-0000-000000000001', 'strategic', 'استراتيجي', 'Strategic')
on conflict (organization_id, code) do nothing;
