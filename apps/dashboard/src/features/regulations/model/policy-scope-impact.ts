import type { PolicyScope, ReferenceOption } from "./types";

export type ScopeImpactReferences = {
  units: ReferenceOption[];
  classes: ReferenceOption[];
};

function scopeTargetId(scope: PolicyScope) {
  if (scope.scope_type === "governance_class") {
    return scope.governance_class_id ?? scope.target_id;
  }
  if (scope.scope_type === "governance_unit_type") {
    return scope.governance_unit_type_id ?? scope.target_id;
  }
  return scope.governance_unit_id ?? scope.target_id;
}

export function resolvePolicyScopeUnits(
  scope: PolicyScope,
  references: ScopeImpactReferences,
) {
  const units = references.units.filter((unit) => unit.status !== "archived");
  const targetId = scopeTargetId(scope);

  if (scope.scope_type === "organization") return units;
  if (scope.scope_type === "governance_unit") {
    return units.filter((unit) => unit.id === targetId);
  }
  if (scope.scope_type === "governance_class") {
    return units.filter((unit) => unit.governance_class_id === targetId);
  }
  if (scope.scope_type === "governance_unit_type") {
    return units.filter((unit) => unit.unit_type_id === targetId);
  }
  if (scope.scope_type === "governance_level") {
    const classIds = new Set(
      references.classes
        .filter(
          (unitClass) => unitClass.governance_level === scope.governance_level,
        )
        .map((unitClass) => unitClass.id),
    );
    return units.filter((unit) =>
      classIds.has(String(unit.governance_class_id ?? "")),
    );
  }
  if (scope.scope_type === "unit_subtree" && targetId) {
    const included = new Set<string>([targetId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of units) {
        if (
          !included.has(unit.id) &&
          included.has(String(unit.parent_unit_id ?? ""))
        ) {
          included.add(unit.id);
          changed = true;
        }
      }
    }
    return units.filter((unit) => included.has(unit.id));
  }
  return [];
}
