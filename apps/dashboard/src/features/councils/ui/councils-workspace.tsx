"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { AlertCircle, Archive, Building2, CalendarDays, CheckCircle2, CircleCheckBig, Crown, GitBranch, LoaderCircle, Pencil, Plus, Power, PowerOff, RefreshCw, Search, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { PageHeader } from "@/shared/ui/page-header";
import { councilRpc } from "../api/councils-client";
import { filterCouncilTree } from "../model/council-filters";
import type { CouncilDetail, CouncilFormOptions, CouncilFormValues, CouncilMembership, CouncilMembershipResult, CouncilReadiness, CouncilSearchResult, CouncilSummary, CouncilTreeNode, RoleOption, UserOption } from "../model/types";
import { CouncilFormDialog } from "./council-form-dialog";
import { EditMembershipDialog, EndMembershipDialog, LeadershipDialog, MemberDialog, MoveCouncilDialog, ReasonDialog } from "./council-operation-dialogs";
import { CouncilStatusBadge } from "./council-status-badge";
import { CouncilTree } from "./council-tree";

type Props = { initialSearch: CouncilSearchResult; initialTree: CouncilTreeNode[]; options: CouncilFormOptions; roles: RoleOption[]; users: UserOption[] };
type Tab = "overview" | "members" | "readiness";
type Notice = { kind: "success" | "error"; message: string } | null;
type LifecycleDialog = "activate" | "deactivate" | "archive" | null;

export function CouncilsWorkspace({ initialSearch, initialTree, options, roles, users }: Props) {
  const [result, setResult] = useState(initialSearch);
  const [tree, setTree] = useState(initialTree);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(initialSearch.items[0]?.id ?? initialTree[0]?.id);
  const [detail, setDetail] = useState<CouncilDetail | null>(null);
  const [members, setMembers] = useState<CouncilMembership[]>([]);
  const [readiness, setReadiness] = useState<CouncilReadiness | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [leadership, setLeadership] = useState(false);
  const [editingMember, setEditingMember] = useState<CouncilMembership | null>(null);
  const [endingMember, setEndingMember] = useState<CouncilMembership | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleDialog>(null);

  function showError(error: unknown, fallback: string) { setNotice({ kind: "error", message: error instanceof Error ? error.message : fallback }); }
  function showSuccess(message: string) { setNotice({ kind: "success", message }); }

  const councilOptions: CouncilFormOptions = {
    ...options,
    parent_units: Array.from(new Map([
      ...options.parent_units,
      ...result.items.map((item) => ({ id: item.id, code: item.code, name_ar: item.name_ar, name_en: item.name_en })),
    ].map((item) => [item.id, item])).values()),
  };
  const visibleTree = filterCouncilTree(tree, deferredQuery, status);
  const visibleSelectedId = selectedId && visibleTree.some((item) => item.id === selectedId) ? selectedId : undefined;

  async function loadList(search = deferredQuery, selectedStatus = status) {
    setLoadingList(true);
    try {
      const [nextResult, nextTree] = await fetchCouncilState(search, selectedStatus);
      startTransition(() => { setResult(nextResult); setTree(nextTree); });
    } catch (error) {
      showError(error, "تعذر تحديث قائمة المجالس.");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadSelected(councilId: string) {
    setLoadingDetail(true);
    try {
      const [nextDetail, memberPage, nextReadiness] = await Promise.all([
        councilRpc<CouncilDetail>("admin_get_council_detail", { p_council_id: councilId }),
        councilRpc<CouncilMembershipResult>("admin_list_council_members", { p_council_id: councilId, p_include_ended: true, p_limit: 100, p_offset: 0 }),
        councilRpc<CouncilReadiness>("admin_validate_council_administrative_readiness", { p_council_id: councilId }),
      ]);
      startTransition(() => { setDetail(nextDetail); setMembers(memberPage.items); setReadiness(nextReadiness); });
    } catch (error) {
      showError(error, "تعذر تحميل بيانات المجلس.");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void fetchCouncilState(deferredQuery, status).then(([nextResult, nextTree]) => {
        if (active) startTransition(() => { setResult(nextResult); setTree(nextTree); });
      }).catch((error) => { if (active) showError(error, "تعذر البحث في المجالس."); }).finally(() => { if (active) setLoadingList(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [deferredQuery, status]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void Promise.all([
      councilRpc<CouncilDetail>("admin_get_council_detail", { p_council_id: selectedId }),
      councilRpc<CouncilMembershipResult>("admin_list_council_members", { p_council_id: selectedId, p_include_ended: true, p_limit: 100, p_offset: 0 }),
      councilRpc<CouncilReadiness>("admin_validate_council_administrative_readiness", { p_council_id: selectedId }),
    ]).then(([nextDetail, memberPage, nextReadiness]) => {
      if (active) startTransition(() => { setDetail(nextDetail); setMembers(memberPage.items); setReadiness(nextReadiness); });
    }).catch((error) => { if (active) showError(error, "تعذر تحميل بيانات المجلس."); }).finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [selectedId]);

  async function refreshCouncil(message: string) {
    await Promise.all([loadList(), selectedId ? loadSelected(selectedId) : Promise.resolve()]);
    showSuccess(message);
  }

  async function createCouncil(values: CouncilFormValues) {
    const created = await councilRpc<{ id: string }>("admin_create_council", {
      p_code: values.code, p_name_ar: values.nameAr, p_name_en: values.nameEn || null, p_description: values.description || null,
      p_unit_type_id: values.unitTypeId, p_parent_unit_id: values.parentUnitId || null, p_governance_class_id: values.governanceClassId || null,
      p_minimum_active_members: values.minimumActiveMembers, p_allow_dual_leadership: values.allowDualLeadership, p_client_request_id: crypto.randomUUID(),
    });
    await loadList(); setDetail(null); setMembers([]); setReadiness(null); setLoadingDetail(true); setSelectedId(created.id); setTab("members"); showSuccess("تم إنشاء المجلس. أضف الأعضاء والقيادة لاستكمال الجاهزية.");
  }

  async function updateCouncil(values: CouncilFormValues) {
    if (!detail) return;
    await councilRpc("admin_update_council", {
      p_council_id: detail.id, p_name_ar: values.nameAr, p_name_en: values.nameEn || null, p_description: values.description || null,
      p_unit_type_id: values.unitTypeId, p_governance_class_id: values.governanceClassId || null,
      p_minimum_active_members: values.minimumActiveMembers, p_allow_dual_leadership: values.allowDualLeadership, p_expected_updated_at: detail.updated_at,
    });
    await refreshCouncil("تم حفظ بيانات المجلس بنجاح.");
  }

  async function moveCouncil(parentId: string | null, reason: string) {
    if (!detail) return;
    await councilRpc("admin_move_council", { p_council_id: detail.id, p_new_parent_unit_id: parentId, p_reason: reason, p_expected_updated_at: detail.updated_at });
    await refreshCouncil("تم نقل المجلس وتحديث مستويات الهيكل التابع له.");
  }

  async function addMember(value: { userId: string; roleId: string; title: string; start: string; end: string | null }) {
    if (!detail) return;
    await councilRpc("admin_add_council_member", { p_council_id: detail.id, p_user_id: value.userId, p_role_id: value.roleId, p_membership_title: value.title, p_start_date: value.start, p_end_date: value.end });
    await refreshCouncil("تمت إضافة العضو وتحديث فحص الجاهزية.");
  }

  async function updateMembership(membership: CouncilMembership, value: { title: string; start: string; end: string | null }) {
    await councilRpc("admin_update_council_membership", { p_membership_id: membership.id, p_membership_title: value.title, p_start_date: value.start, p_end_date: value.end, p_expected_updated_at: membership.updated_at });
    await refreshCouncil("تم تحديث بيانات العضوية.");
  }

  async function endMembership(membership: CouncilMembership, endDate: string, reason: string) {
    await councilRpc("admin_end_council_membership", { p_membership_id: membership.id, p_end_date: endDate, p_reason: reason, p_expected_updated_at: membership.updated_at });
    await refreshCouncil("تم إنهاء العضوية مع الاحتفاظ بسجلها التاريخي.");
  }

  async function assignLeadership(chair: string, rapporteur: string, date: string, reason: string) {
    if (!detail) return;
    await councilRpc("admin_assign_council_leadership", { p_council_id: detail.id, p_chair_user_id: chair, p_rapporteur_user_id: rapporteur, p_effective_date: date, p_reason: reason, p_expected_updated_at: detail.updated_at });
    await refreshCouncil("تم تعيين رئيس المجلس ومقرره وتحديث الجاهزية.");
  }

  async function changeLifecycle(action: Exclude<LifecycleDialog, null>, reason: string) {
    if (!detail) return;
    const contract = action === "activate" ? "admin_activate_council" : action === "deactivate" ? "admin_deactivate_council" : "admin_archive_council";
    await councilRpc(contract, { p_council_id: detail.id, p_reason: reason, p_expected_updated_at: detail.updated_at });
    const message = action === "activate" ? "تم تفعيل المجلس وأصبح جاهزاً للتشغيل." : action === "deactivate" ? "تم تعطيل المجلس وتسجيل السبب." : "تمت أرشفة المجلس نهائياً.";
    await refreshCouncil(message);
  }

  const metrics = [
    { label: "إجمالي المجالس", value: tree.length, icon: Building2, tone: "text-[#0872df] bg-[#eaf4ff]" },
    { label: "المجالس النشطة", value: tree.filter((item) => item.status === "active").length, icon: CircleCheckBig, tone: "text-emerald-700 bg-emerald-50" },
    { label: "مستويات الهيكل", value: Math.max(0, ...tree.map((item) => item.level_no)), icon: GitBranch, tone: "text-[#b86416] bg-[#fff4e8]" },
  ];

  return <div className="mx-auto max-w-[1560px]">
    <PageHeader eyebrow="النواة الحوكمية" title="المجالس والوحدات الحوكمية" description="أدر الهيكل والعضويات والقيادة والجاهزية من مساحة تشغيل واحدة قبل ربط الموضوعات والاجتماعات." actions={<button type="button" onClick={() => setCreating(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0872df] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.2)] hover:bg-[#0065c8]"><Plus size={16} /> إنشاء مجلس</button>} />
    {notice && <div role="status" className={`mb-5 flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.kind === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}<span className="flex-1">{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="إغلاق التنبيه"><X size={16} /></button></div>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3">{metrics.map(({ label, value, icon: Icon, tone }) => <article key={label} className="flex items-center gap-4 rounded-2xl border border-[#dce7f1] bg-white p-4 shadow-[0_8px_24px_rgba(15,42,72,.04)]"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${tone}`}><Icon size={20} /></span><div><strong className="block text-2xl font-black text-[#0a1830]">{value}</strong><span className="text-[10px] font-bold text-[#76889d]">{label}</span></div></article>)}</section>
    <section className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#dce7f1] bg-white p-3 shadow-sm"><label className="relative min-w-[240px] flex-1"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#91a0b1]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز..." className="h-11 w-full rounded-xl border border-[#e0e8f0] bg-[#f8fafc] pr-10 pl-3 text-xs outline-none focus:border-[#8fc3ee] focus:bg-white" /></label><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 min-w-40 rounded-xl border border-[#e0e8f0] bg-white px-3 text-xs font-bold text-[#52647a]"><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option><option value="archived">مؤرشف</option></select><button type="button" onClick={() => void loadList()} className="grid h-11 w-11 place-items-center rounded-xl border border-[#dce7f1] text-[#61758d] hover:bg-[#f2f7fb]" aria-label="تحديث"><RefreshCw size={16} className={loadingList ? "animate-spin" : ""} /></button></section>
    <div className="grid gap-5 xl:grid-cols-[minmax(350px,.78fr)_minmax(0,1.55fr)]">
      <section className="rounded-3xl border border-[#dce7f1] bg-[#f7fafc] p-3 shadow-[0_12px_32px_rgba(15,42,72,.05)]"><div className="mb-3 flex items-center justify-between px-2 py-2"><div><div className="flex items-center gap-2"><h2 className="text-sm font-black text-[#172a42]">شجرة المجالس</h2><span className="rounded-full bg-[#eaf4ff] px-2 py-0.5 text-[9px] font-black text-[#0872df]">{visibleTree.length}</span></div><p className="mt-1 text-[10px] text-[#8393a6]">تطبق عليها فلاتر الاسم والحالة أعلاه.</p></div>{loadingList ? <LoaderCircle size={19} className="animate-spin text-[#0872df]" /> : <GitBranch size={19} className="text-[#0872df]" />}</div><CouncilTree items={visibleTree} selectedId={visibleSelectedId} onSelect={(id) => { setDetail(null); setMembers([]); setReadiness(null); setLoadingDetail(true); setSelectedId(id); setTab("overview"); }} /></section>
      <CouncilDetailPanel detail={visibleSelectedId ? detail : null} fallback={visibleSelectedId ? result.items.find((item) => item.id === visibleSelectedId) : undefined} members={visibleSelectedId ? members : []} readiness={visibleSelectedId ? readiness : null} tab={tab} loading={Boolean(visibleSelectedId && loadingDetail)} onTab={setTab} onEdit={() => setEditing(true)} onMove={() => setMoving(true)} onAddMember={() => setAddingMember(true)} onLeadership={() => setLeadership(true)} onEditMember={setEditingMember} onEndMember={setEndingMember} onLifecycle={setLifecycle} />
    </div>
    {creating && <CouncilFormDialog options={councilOptions} onClose={() => setCreating(false)} onSubmit={createCouncil} />}
    {editing && detail && <CouncilFormDialog mode="edit" options={councilOptions} initialValues={toFormValues(detail)} onClose={() => setEditing(false)} onSubmit={updateCouncil} />}
    {moving && detail && <MoveCouncilDialog parents={councilOptions.parent_units} currentId={detail.id} onClose={() => setMoving(false)} onConfirm={moveCouncil} />}
    {addingMember && <MemberDialog users={users.filter((user) => !members.some((membership) => membership.user_id === user.id && membership.is_effective && !isLeadershipRole(membership.role_code)))} roles={roles} onClose={() => setAddingMember(false)} onConfirm={addMember} />}
    {leadership && <LeadershipDialog users={users} members={members} onClose={() => setLeadership(false)} onConfirm={assignLeadership} />}
    {editingMember && <EditMembershipDialog membership={editingMember} onClose={() => setEditingMember(null)} onConfirm={(value) => updateMembership(editingMember, value)} />}
    {endingMember && <EndMembershipDialog membership={endingMember} onClose={() => setEndingMember(null)} onConfirm={(date, reason) => endMembership(endingMember, date, reason)} />}
    {lifecycle && <ReasonDialog title={lifecycleTitle(lifecycle)} description={lifecycleDescription(lifecycle)} confirmLabel={lifecycle === "activate" ? "تفعيل المجلس" : lifecycle === "deactivate" ? "تعطيل المجلس" : "أرشفة نهائية"} danger={lifecycle !== "activate"} onClose={() => setLifecycle(null)} onConfirm={(reason) => changeLifecycle(lifecycle, reason)} />}
  </div>;
}

function CouncilDetailPanel({ detail, fallback, members, readiness, tab, loading, onTab, onEdit, onMove, onAddMember, onLeadership, onEditMember, onEndMember, onLifecycle }: { detail: CouncilDetail | null; fallback?: CouncilSummary; members: CouncilMembership[]; readiness: CouncilReadiness | null; tab: Tab; loading: boolean; onTab: (tab: Tab) => void; onEdit: () => void; onMove: () => void; onAddMember: () => void; onLeadership: () => void; onEditMember: (membership: CouncilMembership) => void; onEndMember: (membership: CouncilMembership) => void; onLifecycle: (action: Exclude<LifecycleDialog, null>) => void }) {
  const council = detail ?? fallback;
  if (!council) return <section className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-[#c9d8e6] bg-white p-10 text-center"><div><Building2 size={36} className="mx-auto text-[#a2b3c5]" /><h2 className="mt-4 text-sm font-black text-[#344861]">اختر مجلساً من الشجرة</h2><p className="mt-2 text-xs text-[#8494a6]">ستظهر بيانات المجلس وعضوياته وجاهزيته هنا.</p></div></section>;
  const archived = council.status === "archived";
  const activePeople = new Set(members.filter((membership) => membership.is_effective).map((membership) => membership.user_id)).size;
  return <section className="relative overflow-hidden rounded-3xl border border-[#dce7f1] bg-white shadow-[0_12px_32px_rgba(15,42,72,.05)]">
    {loading && <div className="absolute inset-x-0 top-0 z-20 h-1 overflow-hidden bg-[#dbeeff]"><div className="h-full w-1/3 animate-pulse bg-[#0872df]" /></div>}
    <div className="relative overflow-hidden bg-[linear-gradient(125deg,#071b39_0%,#0b4f8d_58%,#0872df_100%)] p-6 text-white"><div className="absolute -left-16 -top-20 h-52 w-52 rounded-full border border-white/15" /><div className="relative flex flex-wrap items-start gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/14 ring-1 ring-white/20"><Building2 size={26} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{council.name_ar}</h2><CouncilStatusBadge value={council.status} /></div><p dir="ltr" className="mt-1 w-fit text-[11px] font-bold text-white/60">{council.code}</p><p className="mt-3 max-w-2xl text-xs leading-6 text-white/75">{council.description || "لم يضف وصف لاختصاص المجلس بعد."}</p></div>{detail && !archived && <div className="flex gap-2"><ActionButton icon={Pencil} label="تعديل" onClick={onEdit} /><ActionButton icon={GitBranch} label="نقل" onClick={onMove} /></div>}</div></div>
    <div className="flex gap-2 overflow-x-auto border-b border-[#e4ecf3] bg-[#fbfdff] px-5 pt-3">{([{ id: "overview", label: "نظرة عامة", icon: Building2 }, { id: "members", label: `الأعضاء (${activePeople})`, icon: UsersRound }, { id: "readiness", label: "الجاهزية والتشغيل", icon: ShieldCheck }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onTab(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-black transition ${tab === id ? "border-[#0872df] text-[#0872df]" : "border-transparent text-[#718399] hover:text-[#29445f]"}`}><Icon size={15} />{label}</button>)}</div>
    {tab === "overview" && <Overview detail={detail} council={council} />}
    {tab === "members" && <MembersPanel members={members} archived={archived} onAdd={onAddMember} onLeadership={onLeadership} onEdit={onEditMember} onEnd={onEndMember} />}
    {tab === "readiness" && <ReadinessPanel council={council} readiness={readiness} onLifecycle={onLifecycle} />}
  </section>;
}

function Overview({ detail, council }: { detail: CouncilDetail | null; council: CouncilSummary }) { return <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"><Info icon={GitBranch} label="المجلس الأب" value={detail?.parent_unit?.name_ar || "جذر الهيكل"} /><Info icon={ShieldCheck} label="التصنيف الحوكمي" value={detail?.governance_class?.name_ar || council.governance_class_name_ar || "غير محدد"} /><Info icon={UsersRound} label="الحد الأدنى للأعضاء" value={`${council.minimum_active_members} أعضاء`} /><Info icon={Building2} label="نوع المجلس" value={detail?.unit_type?.name_ar || council.unit_type_name_ar || "غير محدد"} /><Info icon={GitBranch} label="المستوى التنظيمي" value={`المستوى ${council.level_no}`} /><Info icon={ShieldCheck} label="ازدواج القيادة" value={council.allow_dual_leadership ? "مسموح" : "غير مسموح"} /></div>; }

function MembersPanel({ members, archived, onAdd, onLeadership, onEdit, onEnd }: { members: CouncilMembership[]; archived: boolean; onAdd: () => void; onLeadership: () => void; onEdit: (membership: CouncilMembership) => void; onEnd: (membership: CouncilMembership) => void }) {
  const people = Array.from(members.reduce((groups, membership) => {
    const current = groups.get(membership.user_id) ?? [];
    current.push(membership);
    groups.set(membership.user_id, current);
    return groups;
  }, new Map<string, CouncilMembership[]>()).values()).sort((left, right) => {
    const effectiveDifference = Number(right.some((membership) => membership.is_effective)) - Number(left.some((membership) => membership.is_effective));
    return effectiveDifference || left[0].full_name_ar.localeCompare(right[0].full_name_ar, "ar");
  });
  return <div className="bg-[#f8fbfe] p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#1b314b]">أعضاء المجلس وأدوارهم</h3><p className="mt-1 text-[10px] text-[#7c8da0]">بطاقة واحدة لكل شخص، وتبقى صلاحيات كل دور وفترته مستقلة.</p></div>{!archived && <div className="flex gap-2"><button type="button" onClick={onLeadership} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#bcd8ef] bg-white px-3 text-[10px] font-black text-[#1768a8] shadow-sm transition hover:border-[#8bbce3] hover:bg-[#f4faff]"><Crown size={14} /> تعيين القيادة</button><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#0872df] px-3 text-[10px] font-black text-white shadow-[0_6px_14px_rgba(8,114,223,.18)] transition hover:bg-[#0065c8]"><UserPlus size={14} /> إضافة عضو</button></div>}</div>{people.length ? <div className="grid items-start gap-3 md:grid-cols-2">{people.map((personMemberships) => <MemberCard key={personMemberships[0].user_id} memberships={personMemberships} archived={archived} onEdit={onEdit} onEnd={onEnd} />)}</div> : <EmptyState icon={UsersRound} title="لا توجد عضويات بعد" description="أضف أعضاء المجلس، ثم عيّن الرئيس والمقرر حتى يصبح المجلس جاهزاً." />}</div>;
}

function MemberCard({ memberships, archived, onEdit, onEnd }: { memberships: CouncilMembership[]; archived: boolean; onEdit: (membership: CouncilMembership) => void; onEnd: (membership: CouncilMembership) => void }) {
  const person = memberships[0];
  const effective = memberships.some((membership) => membership.is_effective);
  const activeRoles = memberships.filter((membership) => membership.is_effective).length;
  return <article className={`overflow-hidden rounded-2xl border bg-white shadow-[0_8px_22px_rgba(25,55,88,.045)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(25,55,88,.08)] ${effective ? "border-[#d8e5f0]" : "border-[#e2e7ec] opacity-70"}`}><header className="relative flex items-center gap-3 overflow-hidden border-b border-[#e9eff5] bg-[linear-gradient(110deg,#ffffff_20%,#f2f8fd_100%)] p-4"><span className="absolute -left-8 -top-12 h-28 w-28 rounded-full border border-[#d8eafb]" /><span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,#0872df,#0a4f92)] text-base font-black text-white shadow-[0_7px_16px_rgba(8,114,223,.22)]">{person.full_name_ar.slice(0, 1)}</span><div className="relative min-w-0 flex-1"><strong className="block truncate text-sm font-black text-[#1c344f]">{person.full_name_ar}</strong><p className="mt-1 truncate text-[9px] font-bold text-[#8090a2]">{memberships.filter((membership) => membership.is_effective).map((membership) => membership.role_name_ar).join(" • ") || "لا توجد أدوار فعالة"}</p></div><span className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black ${effective ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${effective ? "bg-emerald-500" : "bg-slate-400"}`} />{effective ? `${activeRoles} فعال` : "منتهٍ"}</span></header><div className="space-y-2 p-3">{memberships.map((membership) => {
    const leadershipRole = isLeadershipRole(membership.role_code);
    return <div key={membership.id} className={`rounded-xl border p-3 ${leadershipRole ? "border-[#f1d5b8] bg-[#fffaf5]" : "border-[#dce9f4] bg-[#f7fbff]"}`}><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${leadershipRole ? "bg-[#fff0df] text-[#b15a16]" : "bg-[#e5f2ff] text-[#0872df]"}`}>{leadershipRole ? <Crown size={13} /> : <UsersRound size={13} />}</span><div className="min-w-0 flex-1"><strong className={`block truncate text-[10px] font-black ${leadershipRole ? "text-[#8f4813]" : "text-[#1e5f98]"}`}>{membership.membership_title || membership.role_name_ar}</strong><span className="mt-0.5 block text-[8px] text-[#8796a7]">{membership.role_name_ar}</span></div><span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${membership.is_effective ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{membership.is_effective ? "فعال" : "منتهٍ"}</span>{membership.membership_status === "active" && !archived && <div className="flex gap-0.5"><button type="button" onClick={() => onEdit(membership)} className="grid h-7 w-7 place-items-center rounded-lg text-[#62778e] transition hover:bg-white hover:text-[#0872df] hover:shadow-sm" aria-label={`تعديل دور ${membership.role_name_ar} لـ ${membership.full_name_ar}`} title="تعديل الدور"><Pencil size={13} /></button><button type="button" onClick={() => onEnd(membership)} className="grid h-7 w-7 place-items-center rounded-lg text-[#8b9aab] transition hover:bg-red-50 hover:text-red-600" aria-label={`إنهاء دور ${membership.role_name_ar} لـ ${membership.full_name_ar}`} title="إنهاء الدور"><PowerOff size={13} /></button></div>}</div><div className="mt-2 flex items-center gap-1.5 border-t border-black/5 pt-2 text-[8px] font-bold text-[#8493a4]"><CalendarDays size={11} /><span>{formatDate(membership.start_date)}</span><span className="text-[#b0bcc8]">←</span><span>{membership.end_date ? formatDate(membership.end_date) : "مستمرة"}</span></div></div>;
  })}</div></article>;
}

function ReadinessPanel({ council, readiness, onLifecycle }: { council: CouncilSummary; readiness: CouncilReadiness | null; onLifecycle: (action: Exclude<LifecycleDialog, null>) => void }) {
  const ready = readiness?.administratively_ready ?? false;
  const issues = [...(readiness?.errors ?? []), ...(readiness?.warnings ?? [])];
  return <div className="p-5"><div className={`mb-4 rounded-2xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-3">{ready ? <CheckCircle2 className="mt-0.5 text-emerald-700" size={21} /> : <AlertCircle className="mt-0.5 text-amber-700" size={21} />}<div className="flex-1"><strong className={`text-sm font-black ${ready ? "text-emerald-900" : "text-amber-900"}`}>{ready ? "المجلس مكتمل الجاهزية الإدارية" : "المجلس يحتاج إلى استكمال المتطلبات"}</strong><p className="mt-1 text-[10px] leading-5 opacity-75">الأعضاء الفعالون: {readiness?.active_member_count ?? 0} من أصل {readiness?.minimum_active_members ?? council.minimum_active_members} كحد أدنى.</p></div></div></div>{issues.length > 0 && <div className="mb-5 space-y-2"><h3 className="text-xs font-black text-[#344861]">نتائج الفحص</h3>{issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex gap-3 rounded-xl border border-[#e2e9f0] bg-[#fbfdff] p-3"><AlertCircle size={15} className="mt-0.5 shrink-0 text-[#b96d1d]" /><div><strong className="block text-[10px] font-black text-[#3b5069]">{issue.message}</strong><span dir="ltr" className="mt-1 block w-fit text-[9px] text-[#8b99a9]">{issue.code}</span></div></div>)}</div>}<div className="flex flex-wrap gap-2 border-t border-[#e7eef5] pt-4">{council.status === "inactive" && <button type="button" disabled={!ready} onClick={() => onLifecycle("activate")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#aeb9c4]" title={!ready ? "استكمل متطلبات الجاهزية أولاً" : undefined}><Power size={15} /> تفعيل المجلس</button>}{council.status === "active" && <button type="button" onClick={() => onLifecycle("deactivate")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-800"><PowerOff size={15} /> تعطيل المجلس</button>}{council.status !== "archived" && <button type="button" onClick={() => onLifecycle("archive")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700"><Archive size={15} /> أرشفة نهائية</button>}{council.status === "archived" && <p className="text-xs font-bold text-[#718399]">هذا المجلس مؤرشف نهائياً، وتبقى بياناته متاحة للرجوع والتدقيق فقط.</p>}</div></div>;
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-[10px] font-black text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"><Icon size={14} />{label}</button>; }
function Info({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) { return <div className="rounded-2xl border border-[#e4ecf3] bg-[#fbfdff] p-4"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#eaf4ff] text-[#0872df]"><Icon size={15} /></span><span className="mt-3 block text-[9px] font-bold text-[#8998a9]">{label}</span><strong className="mt-1 block text-xs font-black text-[#263a53]">{value}</strong></div>; }
function EmptyState({ icon: Icon, title, description }: { icon: typeof UsersRound; title: string; description: string }) { return <div className="rounded-2xl border border-dashed border-[#cbd9e6] bg-[#f8fbfd] p-8 text-center"><Icon size={30} className="mx-auto text-[#9aacbd]" /><strong className="mt-3 block text-xs font-black text-[#3b5069]">{title}</strong><p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-[#8292a4]">{description}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function lifecycleTitle(action: Exclude<LifecycleDialog, null>) { return action === "activate" ? "تفعيل المجلس" : action === "deactivate" ? "تعطيل المجلس" : "أرشفة المجلس نهائياً"; }
function lifecycleDescription(action: Exclude<LifecycleDialog, null>) { return action === "activate" ? "سيصبح المجلس متاحاً للعمليات بعد التحقق النهائي من الجاهزية." : action === "deactivate" ? "سيتم إيقاف العمليات الجديدة مع إبقاء السجل محفوظاً." : "الأرشفة انتقال نهائي ولا تنجح إذا وُجدت مجالس تابعة غير مؤرشفة."; }
function isLeadershipRole(roleCode: string) { return roleCode === "council_chair" || roleCode === "council_rapporteur"; }
function toFormValues(detail: CouncilDetail): CouncilFormValues { return { code: detail.code, nameAr: detail.name_ar, nameEn: detail.name_en ?? "", description: detail.description ?? "", unitTypeId: detail.unit_type_id, parentUnitId: detail.parent_unit_id ?? "", governanceClassId: detail.governance_class_id ?? "", minimumActiveMembers: detail.minimum_active_members, allowDualLeadership: detail.allow_dual_leadership }; }
function fetchCouncilState(query: string, status: string) { return Promise.all([councilRpc<CouncilSearchResult>("admin_search_councils", { p_query: query || null, p_status: status || null, p_unit_type_id: null, p_governance_class_id: null, p_parent_unit_id: null, p_limit: 100, p_offset: 0 }), councilRpc<CouncilTreeNode[]>("admin_get_councils_tree")]); }
