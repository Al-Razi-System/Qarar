export type HolderKind = "user" | "council_position" | "position_rule";
export type TargetMode = "subtree" | "selected";

export type OversightAssignment = {
  id: string;
  version: number;
  status: "active" | "ended";
  title_ar: string | null;
  holder_kind: HolderKind;
  holder_user_id?: string | null;
  holder_user_name_ar?: string | null;
  holder_council_id?: string | null;
  holder_council_name_ar?: string | null;
  holder_role_code?: string | null;
  holder_role_name_ar?: string | null;
  holder_class_id?: string | null;
  holder_class_name_ar?: string | null;
  target_mode: TargetMode;
  root_unit_id: string | null;
  root_unit_name_ar?: string | null;
  target_class_ids: string[];
  target_class_names_ar: string[];
  council_ids: string[];
  council_names_ar: string[];
  starts_on: string;
  ends_on: string | null;
  end_reason?: string | null;
  coverage: { council_count: number; holder_count: number; holders: string[] };
};

export type OversightWorkspaceData = {
  assignments: OversightAssignment[];
  users: Array<{ id: string; name_ar: string | null; email: string | null }>;
  roles: Array<{ code: string; name_ar: string }>;
  classes: Array<{ id: string; name_ar: string }>;
  units: Array<{ id: string; name_ar: string; parent_id: string | null }>;
  councils: Array<{ id: string; name_ar: string; class_name_ar: string | null; scope_unit_name_ar: string | null }>;
  unlinked_councils: Array<{ id: string; name_ar: string }>;
};

export type OversightDefinition = {
  title_ar: string;
  holder_kind: HolderKind;
  holder_user_id: string;
  holder_council_id: string;
  holder_role_code: string;
  holder_class_id: string;
  target_mode: TargetMode;
  root_unit_id: string;
  target_class_ids: string[];
  council_ids: string[];
  starts_on: string;
  ends_on: string;
};

export type OversightPreview = {
  council_count: number;
  councils: Array<{ id: string; name_ar: string; class_name_ar: string | null }>;
  holders: Array<{ id: string; name_ar: string | null; council_count: number }>;
};

const quote = (value?: string | null) => `«${value ?? "—"}»`;
const list = (values: string[]) => values.map(quote).join(" و");

/** Arabic counting: «مجلس واحد»، «مجلسان»، «5 مجالس»، «24 مجلسًا»، «100 مجلس». */
export function councilCount(count: number) {
  const n = count.toLocaleString("ar-SA-u-nu-latn");
  if (count === 0) return "لا مجالس";
  if (count === 1) return "مجلس واحد";
  if (count === 2) return "مجلسان";
  const lastTwo = count % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `${n} مجالس`;
  if (lastTwo >= 11 && lastTwo <= 99) return `${n} مجلسًا`;
  return `${n} مجلس`;
}

export function holderSentence(assignment: Pick<OversightAssignment, "holder_kind" | "holder_user_name_ar" | "holder_role_name_ar" | "holder_council_name_ar" | "holder_class_name_ar">) {
  if (assignment.holder_kind === "user") return assignment.holder_user_name_ar ?? "شخص لم يعد موجودًا";
  if (assignment.holder_kind === "council_position") return `${assignment.holder_role_name_ar ?? "منصب"} في ${quote(assignment.holder_council_name_ar)}`;
  return `${assignment.holder_role_name_ar ?? "منصب"} في كل ${quote(assignment.holder_class_name_ar)}`;
}

export function scopeSentence(assignment: Pick<OversightAssignment, "holder_kind" | "target_mode" | "root_unit_name_ar" | "target_class_names_ar" | "council_names_ar">) {
  if (assignment.target_mode === "selected") return `يتابع: ${list(assignment.council_names_ar)}`;
  const kinds = assignment.target_class_names_ar.length ? `المجالس من نوع ${list(assignment.target_class_names_ar)}` : "كل المجالس";
  return assignment.holder_kind === "position_rule"
    ? `يتابع ${kinds} التابعة لوحدة مجلسه`
    : `يتابع ${kinds} تحت ${quote(assignment.root_unit_name_ar)}`;
}

export function emptyDefinition(): OversightDefinition {
  return {
    title_ar: "", holder_kind: "council_position", holder_user_id: "", holder_council_id: "", holder_role_code: "",
    holder_class_id: "", target_mode: "subtree", root_unit_id: "", target_class_ids: [], council_ids: [], starts_on: "", ends_on: "",
  };
}

export function definitionFrom(assignment: OversightAssignment): OversightDefinition {
  return {
    title_ar: assignment.title_ar ?? "", holder_kind: assignment.holder_kind, holder_user_id: assignment.holder_user_id ?? "",
    holder_council_id: assignment.holder_council_id ?? "", holder_role_code: assignment.holder_role_code ?? "",
    holder_class_id: assignment.holder_class_id ?? "", target_mode: assignment.target_mode, root_unit_id: assignment.root_unit_id ?? "",
    target_class_ids: assignment.target_class_ids, council_ids: assignment.council_ids, starts_on: assignment.starts_on ?? "", ends_on: assignment.ends_on ?? "",
  };
}

/** What the contract receives: only the fields the chosen kind uses, blanks as null. */
export function toContract(definition: OversightDefinition) {
  const value = (text: string) => text.trim() || null;
  return {
    title_ar: value(definition.title_ar),
    holder_kind: definition.holder_kind,
    holder_user_id: definition.holder_kind === "user" ? value(definition.holder_user_id) : null,
    holder_council_id: definition.holder_kind === "council_position" ? value(definition.holder_council_id) : null,
    holder_role_code: definition.holder_kind === "user" ? null : value(definition.holder_role_code),
    holder_class_id: definition.holder_kind === "position_rule" ? value(definition.holder_class_id) : null,
    target_mode: definition.target_mode,
    root_unit_id: definition.target_mode === "subtree" && definition.holder_kind !== "position_rule" ? value(definition.root_unit_id) : null,
    target_class_ids: definition.target_mode === "subtree" ? definition.target_class_ids : [],
    council_ids: definition.target_mode === "selected" ? definition.council_ids : [],
    starts_on: value(definition.starts_on),
    ends_on: value(definition.ends_on),
  };
}

/** Whether a preview can be asked for: the holder and the scope are both chosen. */
export function isPreviewable(definition: OversightDefinition) {
  const holder = definition.holder_kind === "user" ? Boolean(definition.holder_user_id)
    : definition.holder_kind === "council_position" ? Boolean(definition.holder_council_id && definition.holder_role_code)
      : Boolean(definition.holder_role_code && definition.holder_class_id);
  const scope = definition.target_mode === "selected" ? definition.council_ids.length > 0
    : definition.holder_kind === "position_rule" || Boolean(definition.root_unit_id);
  return holder && scope;
}

/** Units as an indented list following the tree, for a single select. */
export function unitOptions(units: OversightWorkspaceData["units"]) {
  const children = new Map<string | null, OversightWorkspaceData["units"]>();
  for (const unit of units) {
    const key = unit.parent_id && units.some((other) => other.id === unit.parent_id) ? unit.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), unit]);
  }
  const ordered: Array<{ id: string; label: string }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const unit of (children.get(parent) ?? []).sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"))) {
      ordered.push({ id: unit.id, label: `${"— ".repeat(depth)}${unit.name_ar}` });
      walk(unit.id, depth + 1);
    }
  };
  walk(null, 0);
  return ordered;
}
