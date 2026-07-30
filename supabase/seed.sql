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

insert into public.roles (organization_id, code, name_ar, name_en, role_scope)
values
  ('00000000-0000-0000-0000-000000000001', 'governance_admin', 'مسؤول الحوكمة', 'Governance Admin', 'organization'),
  ('00000000-0000-0000-0000-000000000001', 'council_chair', 'رئيس المجلس', 'Council Chair', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'council_rapporteur', 'مقرر المجلس', 'Council Rapporteur', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'council_member', 'عضو المجلس', 'Council Member', 'governance_unit'),
  ('00000000-0000-0000-0000-000000000001', 'decision_executor', 'منفذ القرار', 'Decision Executor', 'execution'),
  ('00000000-0000-0000-0000-000000000001', 'follow_up_officer', 'جهة المتابعة', 'Follow-up Officer', 'execution'),
  ('00000000-0000-0000-0000-000000000001', 'internal_auditor', 'مراجع داخلي', 'Internal Auditor', 'organization')
on conflict (organization_id, code) do nothing;

insert into public.topic_categories (organization_id, code, name_ar, name_en)
values
  ('00000000-0000-0000-0000-000000000001', 'administrative', 'إداري', 'Administrative'),
  ('00000000-0000-0000-0000-000000000001', 'quality', 'جودة وامتثال', 'Quality and Compliance'),
  ('00000000-0000-0000-0000-000000000001', 'strategic', 'استراتيجي', 'Strategic')
on conflict (organization_id, code) do nothing;
