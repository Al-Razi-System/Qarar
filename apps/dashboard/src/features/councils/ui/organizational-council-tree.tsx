"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronLeft, CircleDot, FolderTree, Landmark, Layers3 } from "lucide-react";
import type { CouncilHierarchyCouncil, CouncilHierarchyData } from "../model/types";
import { buildOrganizationalCouncilTree, type UnitBranch } from "../model/organizational-council-tree";
import styles from "./organizational-council-tree.module.css";

type TreeActions = { selectedId?: string; onSelect: (id: string) => void };
type BranchActions = TreeActions & { collapsed: Set<string>; query: string; toggle: (id: string) => void };

export function OrganizationalCouncilTree({ data, query = "", status = "", selectedId, onSelect }: {
  data: CouncilHierarchyData; query?: string; status?: string;
} & TreeActions) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const forest = useMemo(() => buildOrganizationalCouncilTree(data, query, status), [data, query, status]);
  function toggle(id: string) {
    setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <div className={styles.frame} aria-label="الهيكل التنظيمي والمجالس">
    <div className={styles.toolbar}>
      <span className={styles.legend}><FolderTree size={14} /> الوحدات <span>·</span><Landmark size={13} /> المجالس</span>
      <div className={styles.controls}>
        <button type="button" disabled={Boolean(query.trim())} onClick={() => setCollapsed(new Set())} className={styles.control}>فرد الكل</button>
        <button type="button" disabled={Boolean(query.trim())} onClick={() => setCollapsed(new Set(data.units.map((unit) => unit.id)))} className={styles.control}>طي الكل</button>
      </div>
    </div>
    {!forest.visibleIds.size && <div role="status" className={styles.empty}><Layers3 size={28} className={styles.emptyIcon} /><p>{status ? "لا توجد مجالس مطابقة للحالة المختارة." : query.trim() ? "لا توجد مجالس مطابقة للبحث." : "لا توجد مجالس بعد. أنشئ مجلسًا ليظهر في الهيكل."}</p></div>}
    <ul className={styles.list}>{forest.roots.map((branch) => <Branch key={branch.unit.id} branch={branch} depth={0} collapsed={collapsed} query={query} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />)}</ul>
    {[{ name: "على مستوى المؤسسة", items: forest.institutional }, { name: "ارتباط يحتاج مراجعة", items: forest.unresolved }].filter((group) => group.items.length).map((group) => <section key={group.name} aria-label={group.name} className={styles.group}>
      <h3 className={styles.groupTitle}><CircleDot size={14} />{group.name}</h3>
      <ul className={styles.councils}>{group.items.map((council) => <Council key={council.id} council={council} selectedId={selectedId} onSelect={onSelect} />)}</ul>
    </section>)}
  </div>;
}

function Council({ council, selectedId, onSelect }: { council: CouncilHierarchyCouncil } & TreeActions) {
  const selected = council.id === selectedId;
  const label = council.status === "active" ? "نشط" : council.status === "archived" ? "مؤرشف" : "غير نشط";
  return <li className={styles.council}><button type="button" aria-label={council.name_ar} aria-pressed={selected} onClick={() => onSelect(council.id)} className={`${styles.councilRow} ${selected ? styles.selected : ""}`}>
    <span className={styles.councilIcon}><Landmark size={16} /></span>
    <span className={styles.councilText}><strong className={styles.councilName}>{council.name_ar}</strong></span>
    <span className={`${styles.status} ${styles[council.status]}`}>{label}</span><ChevronLeft size={14} className={styles.councilArrow} />
  </button></li>;
}

function councilCount(branch: UnitBranch): number {
  return branch.councils.length + branch.children.reduce((count, child) => count + councilCount(child), 0);
}

function Branch({ branch, depth, collapsed, query, toggle, selectedId, onSelect }: { branch: UnitBranch; depth: number } & BranchActions) {
  const { unit } = branch;
  const open = Boolean(query.trim()) || !collapsed.has(unit.id);
  return <li className={styles.branch} aria-label={`وحدة ${unit.name_ar}`}>
    <button type="button" aria-label={`${open ? "طي" : "فتح"} ${unit.name_ar}`} aria-expanded={open} onClick={() => toggle(unit.id)} className={styles.unitRow}>
      <ChevronDown size={15} className={`${styles.arrow} ${open ? "" : styles.closed}`} />
      <span className={`${styles.unitIcon} ${depth === 0 ? styles.rootIcon : ""}`}><Building2 size={16} /></span>
      <span className={styles.unitText}><strong className={styles.unitName}>{unit.name_ar}</strong>
        {unit.status !== "active" && <span className={styles.meta}>{unit.status === "archived" ? "مؤرشفة" : "غير نشطة"}</span>}
        {branch.needsReview && <span className={`${styles.meta} ${styles.review}`}>تبعية تحتاج مراجعة</span>}
      </span>
      <span className={styles.count} aria-label={`${councilCount(branch)} مجالس ضمن الفرع`}>{councilCount(branch)}</span>
    </button>
    {open && <ul aria-label={`محتويات ${unit.name_ar}`} className={styles.children} style={depth >= 3 ? { marginInlineStart: 0, paddingInlineStart: 8 } : undefined}>
      {branch.councils.map((council) => <Council key={council.id} council={council} selectedId={selectedId} onSelect={onSelect} />)}
      {branch.children.map((child) => <Branch key={child.unit.id} branch={child} depth={depth + 1} collapsed={collapsed} query={query} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />)}
    </ul>}
  </li>;
}
