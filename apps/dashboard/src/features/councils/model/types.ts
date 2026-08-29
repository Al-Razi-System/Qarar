export type CouncilStatus = "inactive" | "active" | "archived";

export type ReferenceOption = {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
};

export type CouncilSummary = {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  description?: string | null;
  status: CouncilStatus;
  level_no: number;
  parent_unit_id?: string | null;
  unit_type_id: string;
  governance_class_id?: string | null;
  minimum_active_members: number;
  allow_dual_leadership: boolean;
  unit_type_name_ar?: string;
  governance_class_name_ar?: string | null;
  updated_at: string;
};

export type CouncilDetail = CouncilSummary & {
  unit_type: ReferenceOption;
  parent_unit?: Pick<ReferenceOption, "id" | "code" | "name_ar"> | null;
  governance_class?: ReferenceOption | null;
};

export type CouncilTreeNode = Pick<CouncilSummary, "id" | "code" | "name_ar" | "status" | "level_no" | "parent_unit_id"> & {
  path_ids: string[];
  path_names: string[];
};

export type CouncilFormOptions = {
  council_types: ReferenceOption[];
  parent_units: ReferenceOption[];
  governance_classes: ReferenceOption[];
  leadership_roles: string[];
};

export type UserOption = { id: string; full_name_ar: string; email: string; status?: string };
export type RoleOption = { id: string; code: string; name_ar: string; role_scope?: string };

export type CouncilMembership = {
  id: string; user_id: string; full_name_ar: string; full_name_en?: string | null;
  role_id: string; role_code: string; role_name_ar: string; membership_title?: string | null;
  membership_status: "active" | "ended"; start_date: string; end_date?: string | null;
  updated_at: string; is_effective: boolean;
};
export type CouncilMembershipResult = { items: CouncilMembership[]; total: number; limit: number; offset: number };
export type ReadinessIssue = { code: string; field: string; message: string; required?: number; actual?: number };
export type CouncilReadiness = {
  governance_unit_id: string; administratively_ready: boolean; errors: ReadinessIssue[]; warnings: ReadinessIssue[];
  active_member_count: number; minimum_active_members: number; chair_user_id?: string | null;
  rapporteur_user_id?: string | null; checked_at: string;
};

export type CouncilSearchResult = {
  items: CouncilSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type CouncilFormValues = {
  code: string;
  nameAr: string;
  nameEn: string;
  description: string;
  unitTypeId: string;
  parentUnitId: string;
  governanceClassId: string;
  minimumActiveMembers: number;
  allowDualLeadership: boolean;
};
