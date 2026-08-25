import type { PolicyItem } from "./types";

export type PolicyContentNode = {
  item: PolicyItem;
  children: PolicyContentNode[];
};

export type PolicyContentEntry = {
  item: PolicyItem;
  depth: number;
  ancestors: PolicyItem[];
};

const arabicDiacritics = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;

export function normalizePolicySearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ar")
    .replace(arabicDiacritics, "")
    .replace(/ـ/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي");
}

function compareItems(left: PolicyItem, right: PolicyItem) {
  return (
    left.sort_order - right.sort_order ||
    left.item_code.localeCompare(right.item_code, "ar", { numeric: true }) ||
    left.title_ar.localeCompare(right.title_ar, "ar")
  );
}

export function buildPolicyContentTree(items: PolicyItem[]) {
  const sortedItems = [...items].sort(compareItems);
  const itemById = new Map(sortedItems.map((item) => [item.id, item]));
  const childIds = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const item of sortedItems) {
    const parentId = item.parent_item_id;
    if (!parentId || parentId === item.id || !itemById.has(parentId)) {
      rootIds.push(item.id);
      continue;
    }
    childIds.set(parentId, [...(childIds.get(parentId) ?? []), item.id]);
  }

  const emitted = new Set<string>();
  const buildNode = (id: string, ancestry: Set<string>): PolicyContentNode | null => {
    const item = itemById.get(id);
    if (!item || ancestry.has(id)) return null;
    emitted.add(id);
    const nextAncestry = new Set(ancestry).add(id);
    const children = (childIds.get(id) ?? [])
      .map((childId) => buildNode(childId, nextAncestry))
      .filter((child): child is PolicyContentNode => Boolean(child));
    return { item, children };
  };

  const roots = rootIds
    .map((id) => buildNode(id, new Set()))
    .filter((node): node is PolicyContentNode => Boolean(node));

  // Corrupt cyclic relationships should remain visible instead of hiding content.
  for (const item of sortedItems) {
    if (emitted.has(item.id)) continue;
    const recoveredRoot = buildNode(item.id, new Set());
    if (recoveredRoot) roots.push(recoveredRoot);
  }

  return roots;
}

export function flattenPolicyContent(
  nodes: PolicyContentNode[],
  ancestors: PolicyItem[] = [],
): PolicyContentEntry[] {
  return nodes.flatMap((node) => [
    { item: node.item, depth: ancestors.length, ancestors },
    ...flattenPolicyContent(node.children, [...ancestors, node.item]),
  ]);
}

export function searchPolicyContent(
  entries: PolicyContentEntry[],
  query: string,
) {
  const normalizedQuery = normalizePolicySearch(query);
  if (!normalizedQuery) return entries;
  return entries.filter(({ item }) =>
    normalizePolicySearch(
      [
        item.item_code,
        item.title_ar,
        item.title_en,
        item.official_text,
        item.body_text,
        item.interpretation_text,
        item.source_locator,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(normalizedQuery),
  );
}

export function countPolicyContent(items: PolicyItem[]) {
  return items.reduce(
    (counts, item) => {
      counts.total += 1;
      if (item.item_type === "article") counts.articles += 1;
      if (item.item_type === "clause") counts.clauses += 1;
      if (item.item_type === "chapter") counts.chapters += 1;
      if (item.item_type === "section") counts.sections += 1;
      counts.rules += item.rules?.length ?? 0;
      return counts;
    },
    { total: 0, chapters: 0, sections: 0, articles: 0, clauses: 0, rules: 0 },
  );
}
