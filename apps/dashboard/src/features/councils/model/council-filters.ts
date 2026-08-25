import type { CouncilTreeNode } from "./types";

export function filterCouncilTree(items: CouncilTreeNode[], query: string, status: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!normalizedQuery) return true;
    return [item.name_ar, item.code, ...item.path_names]
      .some((value) => value.toLocaleLowerCase("ar").includes(normalizedQuery));
  });
}
