export type ScopeRule = { kind: "council" | "class"; target_id: string; include_descendants: boolean };
export type ScopeCouncil = { id: string; name_ar: string; scope_unit_id: string | null; class_id: string | null; status: string };
export type ScopeUnit = { id: string; name_ar: string; parent_unit_id: string | null; status: string };
export type SubmissionScope = { user_name_ar?: string; submission_enabled?: boolean; revision: number; home_unit_id: string | null; rules: ScopeRule[]; councils: ScopeCouncil[]; units: ScopeUnit[]; classes: { id: string; name_ar: string }[] };
/** Preview only. The contextual database predicate remains authoritative. */
export function previewSubmissionScope(rules: ScopeRule[], councils: ScopeCouncil[], units: ScopeUnit[]) {
  const unitMap = new Map(units.map(unit => [unit.id, unit]));
  function below(child: string | null, ancestor: string | null) {
    if (!child || !ancestor || child === ancestor) return false;
    const visited = new Set<string>(); let current = unitMap.get(child)?.parent_unit_id;
    while (current && !visited.has(current)) {
      if (current === ancestor) return true;
      visited.add(current); current = unitMap.get(current)?.parent_unit_id;
    }
    return false;
  }
  const roots = rules.flatMap(rule => councils.filter(council => rule.kind === "council" ? council.id === rule.target_id : council.class_id === rule.target_id).map(council => ({ council, rule })));
  return councils.filter(target => roots.some(({ council, rule }) => council.id === target.id || (rule.include_descendants && below(target.scope_unit_id, council.scope_unit_id))));
}
