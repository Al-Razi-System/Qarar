import type { CouncilHierarchyCouncil, CouncilHierarchyData, CouncilHierarchyUnit } from "./types";

export type UnitBranch = { unit: CouncilHierarchyUnit; children: UnitBranch[]; councils: CouncilHierarchyCouncil[]; needsReview: boolean };
const normalize = (value: string) => value.trim().toLocaleLowerCase("ar");

export function buildOrganizationalCouncilTree(data: CouncilHierarchyData, query = "", status = "") {
  const units = new Map(data.units.map((unit) => [unit.id, unit]));
  const branches = new Map(data.units.map((unit) => [unit.id, { unit, children: [], councils: [], needsReview: false } as UnitBranch]));
  const roots: UnitBranch[] = [];
  for (const branch of branches.values()) {
    const seen = new Set([branch.unit.id]);
    let parent = branch.unit.parent_unit_id; let invalid = false;
    while (parent) {
      if (seen.has(parent) || !units.has(parent)) { invalid = true; break; }
      seen.add(parent); parent = units.get(parent)!.parent_unit_id;
    }
    branch.needsReview = invalid;
    const parentBranch = !invalid && branch.unit.parent_unit_id ? branches.get(branch.unit.parent_unit_id) : undefined;
    if (parentBranch) parentBranch.children.push(branch); else roots.push(branch);
  }
  const institutional: CouncilHierarchyCouncil[] = []; const unresolved: CouncilHierarchyCouncil[] = [];
  for (const council of data.councils) {
    if (!council.scope_unit_id) institutional.push(council);
    else if (branches.has(council.scope_unit_id)) branches.get(council.scope_unit_id)!.councils.push(council);
    else unresolved.push(council);
  }
  const term = normalize(query);
  const matches = (council: CouncilHierarchyCouncil, inherited = false) => (!status || council.status === status)
    && (!term || inherited || normalize(`${council.name_ar} ${council.code}`).includes(term));
  const visibleIds = new Set<string>();
  const sortCouncils = (items: CouncilHierarchyCouncil[]) => items.sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"));
  function prune(items: UnitBranch[], inherited = false): UnitBranch[] {
    return items.flatMap((branch) => {
      const unitMatch = inherited || Boolean(term && normalize(`${branch.unit.name_ar} ${branch.unit.code}`).includes(term));
      const councils = sortCouncils(branch.councils.filter((council) => matches(council, unitMatch)));
      councils.forEach((council) => visibleIds.add(council.id));
      const children = prune(branch.children, unitMatch);
      if (!councils.length && !children.length) return [];
      return [{ ...branch, councils, children }];
    }).sort((a, b) => a.unit.name_ar.localeCompare(b.unit.name_ar, "ar"));
  }
  const filteredRoots = prune(roots);
  const groups = [institutional, unresolved].map((items) => sortCouncils(items.filter((council) => matches(council))));
  groups.flat().forEach((council) => visibleIds.add(council.id));
  return { roots: filteredRoots, institutional: groups[0], unresolved: groups[1], visibleIds };
}
