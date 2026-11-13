"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { AlertCircle, Archive, Building2, CalendarDays, CheckCircle2, CircleCheckBig, Crown, GitBranch, LoaderCircle, Pencil, Plus, Power, PowerOff, RefreshCw, Search, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { PageHeader } from "@/shared/ui/page-header";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { councilRpc } from "../api/councils-client";
import { buildOrganizationalCouncilTree } from "../model/organizational-council-tree";
import type { CouncilDetail, CouncilFormOptions, CouncilFormValues, CouncilMembership, CouncilMembershipResult, CouncilReadiness, CouncilSearchResult, CouncilSummary, CouncilHierarchyData, CouncilOverviewMap, RoleOption, UserOption } from "../model/types";
import { CouncilFormDialog } from "./council-form-dialog";
import { EditMembershipDialog, EndMembershipDialog, LeadershipDialog, MemberDialog, ReasonDialog } from "./council-operation-dialogs";
import { CouncilStatusBadge } from "./council-status-badge";
import { OrganizationalCouncilTree } from "./organizational-council-tree";
import { CouncilMeetingsPanel } from "./council-meetings-panel";
import treeStyles from "./organizational-council-tree.module.css";

type Props = { initialHierarchy: CouncilHierarchyData; options: CouncilFormOptions; roles: RoleOption[]; users: UserOption[] };
type Tab = "overview" | "members" | "meetings" | "readiness";
type Notice = { kind: "success" | "error"; message: string } | null;
type LifecycleDialog = "activate" | "deactivate" | "archive" | null;

export function CouncilsWorkspace({ initialHierarchy, options, roles, users }: Props) {
  const [result, setResult] = useState<CouncilSearchResult>({ items: initialHierarchy.councils, total: initialHierarchy.councils.length, limit: initialHierarchy.councils.length, offset: 0 });
  const [tree, setTree] = useState(initialHierarchy);
  const [overview, setOverview] = useState<CouncilOverviewMap>({});
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(initialHierarchy.councils[0]?.id);
  const [detail, setDetail] = useState<CouncilDetail | null>(null);
  const [members, setMembers] = useState<CouncilMembership[]>([]);
  const [readiness, setReadiness] = useState<CouncilReadiness | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loadingList, setLoadingList] = useState(false);
  const [hierarchyError, setHierarchyError] = useState("");
  const hierarchyRequest = useRef(0);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState("");
  const detailRequest = useRef(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const creationRequest = useRef<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [leadership, setLeadership] = useState(false);
  const [editingMember, setEditingMember] = useState<CouncilMembership | null>(null);
  const [endingMember, setEndingMember] = useState<CouncilMembership | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleDialog>(null);

  function showSuccess(message: string) { setNotice({ kind: "success", message }); }

  const councilOptions: CouncilFormOptions = {
    ...options,
    parent_units: Array.from(new Map([
      ...options.parent_units,
      ...result.items.map((item) => ({ id: item.id, code: item.code, name_ar: item.name_ar, name_en: item.name_en })),
    ].map((item) => [item.id, item])).values()),
  };
  const visibleIds = buildOrganizationalCouncilTree(tree, deferredQuery, status).visibleIds;
  const visibleTree = tree.councils.filter((item) => visibleIds.has(item.id));
  const visibleSelectedId = selectedId && visibleTree.some((item) => item.id === selectedId) ? selectedId : undefined;


  // The overview only adds facts to the rows; the list works without it if it cannot be read.
  const loadOverview = useCallback(async () => {
    try { setOverview(await councilRpc<CouncilOverviewMap>("get_council_overview_v2")); } catch { /* rows keep their names and status */ }
  }, []);
  useEffect(() => {
    let current = true;
    councilRpc<CouncilOverviewMap>("get_council_overview_v2").then((value) => { if (current) setOverview(value); }).catch(() => undefined);
    return () => { current = false; };
  }, []);

  async function loadList() {
    const request = ++hierarchyRequest.current;
    setLoadingList(true);
    setHierarchyError("");
    try {
      const [nextResult, nextTree] = await fetchCouncilState();
      if (request !== hierarchyRequest.current) return;
      startTransition(() => { setResult(nextResult); setTree(nextTree); });
      void loadOverview();
    } catch (error) {
      if (request === hierarchyRequest.current) setHierarchyError(error instanceof Error ? error.message : "تعذر تحديث الهيكل. حاول مجددًا.");
    } finally {
      if (request === hierarchyRequest.current) setLoadingList(false);
    }
  }

  const loadSelected = useCallback(async (councilId: string) => {
    const request = ++detailRequest.current;
    setLoadingDetail(true);
    setDetailError("");
    setDetail(null); setMembers([]); setReadiness(null);
    try {
      const [nextDetail, memberPage, nextReadiness] = await Promise.all([
        councilRpc<CouncilDetail>("admin_get_council_detail_v2", { p_council_id: councilId }),
        councilRpc<CouncilMembershipResult>("admin_list_council_members", { p_council_id: councilId, p_include_ended: true, p_limit: 100, p_offset: 0 }),
        councilRpc<CouncilReadiness>("admin_validate_council_administrative_readiness", { p_council_id: councilId }),
      ]);
      if (request !== detailRequest.current) return false;
      setDetail(nextDetail); setMembers(memberPage.items); setReadiness(nextReadiness);
      return true;
    } catch (error) {
      if (request === detailRequest.current) setDetailError(error instanceof Error ? error.message : "تعذر تحميل بيانات المجلس.");
      return false;
    } finally {
      if (request === detailRequest.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const requests = detailRequest;
    queueMicrotask(() => { if (active) void loadSelected(selectedId); });
    return () => { active = false; requests.current++; };
  }, [selectedId, loadSelected]);

  async function refreshCouncil(message: string) {
    const [, loaded] = await Promise.all([loadList(), selectedId ? loadSelected(selectedId) : Promise.resolve(true)]);
    showSuccess(loaded ? message : `${message} تعذر تحديث العرض؛ أعد تحميل بيانات المجلس دون إعادة الحفظ.`);
  }

  async function createCouncil(values: CouncilFormValues) {
    creationRequest.current ??= crypto.randomUUID();
    const created = await councilRpc<{ id: string; reference_number: string }>("admin_create_council_with_plan_v2", {
      p_values: {name_ar: values.nameAr, name_en: values.nameEn || null, description: values.description || null,
       unit_type_id: values.unitTypeId, scope_unit_id: values.scopeUnitId || null, parent_council_id: null, governance_class_id: values.governanceClassId || null,
       minimum_active_members: values.minimumActiveMembers, allow_dual_leadership: values.allowDualLeadership},
      p_meeting_plan: values.createMeetingPlan ? { meeting_type_id: values.meetingTypeId, recurrence: values.recurrence, monthly_week: values.monthlyWeek || null, first_meeting_date: values.firstMeetingDate, ends_on: values.planEndMode === "count" ? null : values.planEndsOn || null, occurrence_count: values.planEndMode === "count" ? values.occurrenceCount ?? null : null, missed_after_days: values.missedAfterDays, quorum_percentage: values.quorumPercentage } : null,
      p_client_request_id: creationRequest.current,
    });
    if (!created?.id || !created.reference_number) throw new Error("تعذر تأكيد إنشاء المجلس؛ حدّث القائمة للتحقق قبل المحاولة مجددًا.");
    creationRequest.current = null;
    await loadList(); setDetail(null); setMembers([]); setReadiness(null); setLoadingDetail(true); setSelectedId(created.id); setTab("members"); showSuccess(`تم إنشاء المجلس بالمعرف ${created.reference_number}. أضف الأعضاء والقيادة لاستكمال الجاهزية.`);
  }

  async function updateCouncil(values: CouncilFormValues) {
    if (!detail) return;
    const saved = await councilRpc<{saved: boolean; id: string}>("admin_update_council_v2", {
      p_council_id: detail.id, p_expected_updated_at: detail.updated_at,
      p_values: {name_ar: values.nameAr, name_en: values.nameEn || null, description: values.description || null,
       unit_type_id: values.unitTypeId, governance_class_id: values.governanceClassId || null,
       minimum_active_members: values.minimumActiveMembers, allow_dual_leadership: values.allowDualLeadership},
      p_meeting_plan: values.createMeetingPlan ? {meeting_type_id: values.meetingTypeId, recurrence: values.recurrence, monthly_week: values.monthlyWeek || null,
       first_meeting_date: values.firstMeetingDate, ends_on: values.planEndMode === "count" ? null : values.planEndsOn || null, occurrence_count: values.planEndMode === "count" ? values.occurrenceCount ?? null : null, missed_after_days: values.missedAfterDays, quorum_percentage: values.quorumPercentage} : null,
    });
    if (!saved?.saved || saved.id !== detail.id) throw new Error("تعذر تأكيد الحفظ؛ أعد تحميل المجلس للتحقق قبل المحاولة مجددًا.");
    await refreshCouncil(values.createMeetingPlan ? "تم حفظ المجلس وخطته وإنشاء أول اجتماع كمسودة." : "تم حفظ بيانات المجلس بنجاح.");
  }

  async function addMember(value: { userIds: string[]; roleId: string; title: string; start: string; end: string | null }) {
    if (!detail) return;
    // One contract call per person; whoever failed is named, and those added stay added.
    const failed: string[] = []; let added = 0;
    for (const userId of value.userIds) {
      try {
        await councilRpc("admin_add_council_member", { p_council_id: detail.id, p_user_id: userId, p_role_id: value.roleId, p_membership_title: value.title, p_start_date: value.start, p_end_date: value.end });
        added += 1;
      } catch (cause) { failed.push(`${users.find((user) => user.id === userId)?.full_name_ar ?? "مستخدم"}: ${cause instanceof Error ? cause.message : "تعذر الإضافة"}`); }
    }
    if (added > 0) await refreshCouncil(added === 1 ? "تمت إضافة العضو وتحديث فحص الجاهزية." : `تمت إضافة ${added} أعضاء وتحديث فحص الجاهزية.`);
    if (failed.length) throw new Error(`${added > 0 ? `أُضيف ${added}، لكن ` : ""}تعذرت إضافة ${failed.length}: ${failed.join("؛ ")}`);
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
    await councilRpc("admin_assign_council_leadership", { p_council_id: detail.id, p_chair_user_id: chair || null, p_rapporteur_user_id: rapporteur || null, p_effective_date: date, p_reason: reason, p_expected_updated_at: detail.updated_at });
    await refreshCouncil("تم حفظ تعيين القيادة المحددة وتحديث الجاهزية.");
  }

  async function changeLifecycle(action: Exclude<LifecycleDialog, null>, reason: string) {
    if (!detail) return;
    const contract = action === "activate" ? "admin_activate_council" : action === "deactivate" ? "admin_deactivate_council" : "admin_archive_council";
    await councilRpc(contract, { p_council_id: detail.id, p_reason: reason.trim() || null, p_expected_updated_at: detail.updated_at });
    const message = action === "activate" ? "تم تفعيل المجلس وأصبح جاهزاً للتشغيل." : action === "deactivate" ? "تم تعطيل المجلس وتسجيل السبب." : "تمت أرشفة المجلس نهائياً.";
    await refreshCouncil(message);
  }

  const metrics = [
    { label: "إجمالي المجالس", value: tree.councils.length, icon: Building2, tone: "text-q-primary bg-q-surface-2" },
    { label: "المجالس النشطة", value: tree.councils.filter((item) => item.status === "active").length, icon: CircleCheckBig, tone: "text-q-success bg-q-success-soft" },
    { label: "الوحدات التنظيمية", value: tree.units.length, icon: GitBranch, tone: "text-q-text-2 bg-q-surface-2" },
  ];

  return <div className="mx-auto max-w-[1560px]">
    <PageHeader title="المجالس والوحدات الحوكمية" description="أدر الهيكل والعضويات والقيادة والجاهزية من مساحة تشغيل واحدة قبل ربط الموضوعات والاجتماعات." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> إنشاء مجلس</Button>} />
    {notice && <div className="relative mb-5"><InlineMessage tone={notice.kind === "success" ? "success" : "error"}>{notice.message}</InlineMessage><button type="button" onClick={() => setNotice(null)} aria-label="إغلاق التنبيه" className="absolute inset-y-0 left-1 grid w-11 place-items-center rounded-q-control text-current"><X size={16} /></button></div>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3">{metrics.map(({ label, value, icon: Icon, tone }) => <article key={label} className="flex items-center gap-4 rounded-q-card border border-q-border bg-q-surface p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-q-card ${tone}`}><Icon size={20} /></span><div><strong className="block text-q-h1 font-black text-q-text-2">{value}</strong><span className="text-q-caption font-bold text-q-text-2">{label}</span></div></article>)}</section>
    <section className="mb-5 flex flex-wrap items-center gap-3 rounded-q-card border border-q-border bg-q-surface p-3 shadow-sm"><label className="relative min-w-[240px] flex-1"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-q-text-2" /><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="البحث في الهيكل" placeholder="ابحث عن وحدة أو مجلس..." className="h-11 w-full rounded-q-control border border-q-border bg-q-bg pr-10 pl-3 text-q-caption outline-none focus:border-q-border focus:bg-q-surface" /></label><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 min-w-40 rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-text-2"><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option><option value="archived">مؤرشف</option></select><button type="button" onClick={() => void loadList()} className="grid h-11 w-11 place-items-center rounded-q-control border border-q-border text-q-text-2 hover:bg-q-surface-2" aria-label="تحديث"><RefreshCw size={16} className={loadingList ? "animate-spin" : ""} /></button></section>
    <div className={treeStyles.workspaceGrid}>
      <section className={treeStyles.panel}><div className={treeStyles.panelHeader}><div><div className="flex items-center gap-2"><h2 className="text-q-ui font-black text-q-text-2">الهيكل التنظيمي والمجالس</h2><span className="rounded-full bg-q-surface-2 px-2 py-0.5 text-q-caption font-black text-q-primary">{visibleTree.length}</span></div><p className="mt-1 text-q-caption text-q-text-2">التبعية من الوحدات؛ اختر مجلسًا لعرض تفاصيله.</p></div>{loadingList ? <LoaderCircle size={19} className="animate-spin text-q-primary" /> : <GitBranch size={19} className="text-q-primary" />}</div>{hierarchyError && <div role="alert" className="mb-3 rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-caption text-q-danger">{hierarchyError}<button type="button" disabled={loadingList} onClick={() => void loadList()} className="mt-2 block font-bold underline">إعادة تحميل الهيكل</button></div>}<OrganizationalCouncilTree overview={overview} data={tree} query={deferredQuery} status={status} selectedId={visibleSelectedId} onSelect={(id) => { if (id === selectedId) return; setDetail(null); setMembers([]); setReadiness(null); setLoadingDetail(true); setSelectedId(id); setTab("overview"); }} /></section>
      <CouncilDetailPanel error={detailError} onRetry={() => { if (visibleSelectedId) void loadSelected(visibleSelectedId); }} detail={visibleSelectedId && detail?.id === visibleSelectedId ? detail : null} fallback={visibleSelectedId ? result.items.find((item) => item.id === visibleSelectedId) : undefined} members={visibleSelectedId ? members : []} readiness={visibleSelectedId ? readiness : null} tab={tab} loading={Boolean(visibleSelectedId && loadingDetail)} onTab={setTab} onEdit={() => setEditing(true)} onAddMember={() => setAddingMember(true)} onLeadership={() => setLeadership(true)} onEditMember={setEditingMember} onEndMember={setEndingMember} onLifecycle={setLifecycle} />
    </div>
    {creating && <CouncilFormDialog options={councilOptions} onClose={() => setCreating(false)} onSubmit={createCouncil} />}
    {editing && detail && <CouncilFormDialog mode="edit" canCreateMeetingPlan={detail.can_create_meeting_plan === true} existingPlan={detail.meeting_plan} options={councilOptions} initialValues={toFormValues(detail)} onClose={() => setEditing(false)} onSubmit={updateCouncil} />}
    {addingMember && <MemberDialog users={users} excludedUserIds={members.filter((membership) => membership.is_effective && !isLeadershipRole(membership.role_code)).map((membership) => membership.user_id)} roles={roles} onClose={() => setAddingMember(false)} onConfirm={addMember} />}
    {leadership && <LeadershipDialog users={users} members={members} onClose={() => setLeadership(false)} onConfirm={assignLeadership} />}
    {editingMember && <EditMembershipDialog membership={editingMember} onClose={() => setEditingMember(null)} onConfirm={(value) => updateMembership(editingMember, value)} />}
    {endingMember && <EndMembershipDialog membership={endingMember} onClose={() => setEndingMember(null)} onConfirm={(date, reason) => endMembership(endingMember, date, reason)} />}
    {lifecycle && <ReasonDialog title={lifecycleTitle(lifecycle)} description={lifecycleDescription(lifecycle)} confirmLabel={lifecycle === "activate" ? "تفعيل المجلس" : lifecycle === "deactivate" ? "تعطيل المجلس" : "أرشفة نهائية"} danger={lifecycle !== "activate"} reasonRequired={lifecycle !== "activate"} onClose={() => setLifecycle(null)} onConfirm={(reason) => changeLifecycle(lifecycle, reason)} />}
  </div>;
}

function CouncilDetailPanel({ detail, fallback, members, readiness, tab, loading, error, onRetry, onTab, onEdit, onAddMember, onLeadership, onEditMember, onEndMember, onLifecycle }: { detail: CouncilDetail | null; fallback?: CouncilSummary; members: CouncilMembership[]; readiness: CouncilReadiness | null; tab: Tab; loading: boolean; error: string; onRetry: () => void; onTab: (tab: Tab) => void; onEdit: () => void; onAddMember: () => void; onLeadership: () => void; onEditMember: (membership: CouncilMembership) => void; onEndMember: (membership: CouncilMembership) => void; onLifecycle: (action: Exclude<LifecycleDialog, null>) => void }) {
  const council = detail ?? fallback;
  if (council && (loading || !detail || error)) return <section className="space-y-4 rounded-q-card border border-q-border bg-q-surface p-6" aria-busy={loading}>
    <h2 className="text-q-h3 font-bold text-q-text">{council.name_ar}</h2>
    {loading ? <InlineMessage>جارٍ تحميل بيانات المجلس وأعضائه…</InlineMessage> : <>
      <InlineMessage tone="error">{error || "تعذر تحميل بيانات المجلس وأعضائه؛ لا يعني ذلك خلو المجلس من الأعضاء."}</InlineMessage>
      <Button variant="secondary" onClick={onRetry}>إعادة تحميل بيانات المجلس</Button>
    </>}
  </section>;
  if (!council) return <section className="grid min-h-96 place-items-center rounded-q-card border border-dashed border-q-border bg-q-surface p-10 text-center"><div><Building2 size={36} className="mx-auto text-q-text-2" /><h2 className="mt-4 text-q-ui font-black text-q-text-2">اختر مجلساً من الشجرة</h2><p className="mt-2 text-q-caption text-q-text-2">ستظهر بيانات المجلس وعضوياته وجاهزيته هنا.</p></div></section>;
  const archived = council.status === "archived";
  const activePeople = new Set(members.filter((membership) => membership.is_effective).map((membership) => membership.user_id)).size;
  return <section className="relative overflow-hidden rounded-q-card border border-q-border bg-q-surface shadow-sm">
    {loading && <div className="absolute inset-x-0 top-0 z-20 h-1 overflow-hidden bg-q-surface-2"><div className="h-full w-1/3 animate-pulse bg-q-primary" /></div>}
    <div className="relative overflow-hidden bg-q-header p-6 text-q-on-primary"><div className="absolute -left-16 -top-20 h-52 w-52 rounded-full border border-white/15" /><div className="relative flex flex-wrap items-start gap-4"><span className="grid h-14 w-14 place-items-center rounded-q-card bg-q-surface/14 ring-1 ring-white/20"><Building2 size={26} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-q-h2 font-black">{council.name_ar}</h2><CouncilStatusBadge value={council.status} /></div><p dir="ltr" className="mt-1 w-fit text-q-caption font-bold text-q-on-primary/60">{council.code}</p><p className="mt-3 max-w-2xl text-q-caption leading-6 text-q-on-primary/75">{council.description || "لم يضف وصف لاختصاص المجلس بعد."}</p></div>{detail && !detail.meeting_plan_unavailable && !archived && <div className="flex gap-2"><ActionButton icon={Pencil} label="تعديل" onClick={onEdit} /></div>}</div></div>
    <div className="flex gap-2 overflow-x-auto border-b border-q-border bg-q-bg px-5 pt-3">{([{ id: "overview", label: "نظرة عامة", icon: Building2 }, { id: "members", label: `الأعضاء (${activePeople})`, icon: UsersRound }, { id: "meetings", label: "الاجتماعات", icon: CalendarDays }, { id: "readiness", label: "الجاهزية والتشغيل", icon: ShieldCheck }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onTab(id)} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-q-caption font-black transition ${tab === id ? "border-q-primary text-q-primary" : "border-transparent text-q-text-3 hover:text-q-text-2"}`}><Icon size={15} />{label}</button>)}</div>
    {detail?.meeting_plan_unavailable && <div className="p-5"><InlineMessage>تعديل بيانات المجلس وخطة اجتماعاته غير متاح مؤقتاً. بيانات المجلس وأعضاؤه محفوظة، ويمكن إدارة العضويات من تبويب الأعضاء.</InlineMessage></div>}
    {tab === "overview" && <Overview detail={detail} council={council} />}
    {tab === "members" && <MembersPanel members={members} archived={archived} onAdd={onAddMember} onLeadership={onLeadership} onEdit={onEditMember} onEnd={onEndMember} />}
    {tab === "meetings" && <CouncilMeetingsPanel council={council} detail={detail} archived={archived} onEditPlan={onEdit} />}
    {tab === "readiness" && <ReadinessPanel council={council} readiness={readiness} onLifecycle={onLifecycle} />}
  </section>;
}

function Overview({ detail, council }: { detail: CouncilDetail | null; council: CouncilSummary }) { return <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"><Info icon={Building2} label="الوحدة التنظيمية" value={detail?.scope_unit?.name_ar || "نطاق المؤسسة أو ارتباط تاريخي"} /><Info icon={ShieldCheck} label="التصنيف الحوكمي" value={detail?.governance_class?.name_ar || council.governance_class_name_ar || "غير محدد"} /><Info icon={UsersRound} label="الحد الأدنى للأعضاء" value={`${council.minimum_active_members} أعضاء`} /><Info icon={Building2} label="نوع المجلس" value={detail?.unit_type?.name_ar || council.unit_type_name_ar || "غير محدد"} /><Info icon={GitBranch} label="المستوى التنظيمي" value={`المستوى ${council.level_no}`} /><Info icon={ShieldCheck} label="ازدواج القيادة" value={council.allow_dual_leadership ? "مسموح" : "غير مسموح"} /></div>; }

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
  return <div className="bg-q-bg p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-q-ui font-black text-q-text-2">أعضاء المجلس وأدوارهم</h3><p className="mt-1 text-q-caption text-q-text-2">بطاقة واحدة لكل شخص، وتبقى صلاحيات كل دور وفترته مستقلة.</p></div>{!archived && <div className="flex gap-2"><Button variant="secondary" onClick={onLeadership}><Crown size={14} /> تعيين القيادة</Button><Button onClick={onAdd}><UserPlus size={14} /> إضافة عضو</Button></div>}</div>{people.length ? <div className="grid items-start gap-3 md:grid-cols-2">{people.map((personMemberships) => <MemberCard key={personMemberships[0].user_id} memberships={personMemberships} archived={archived} onEdit={onEdit} onEnd={onEnd} />)}</div> : <EmptyState icon={UsersRound} title="لا توجد عضويات بعد" description="أضف أعضاء المجلس، ثم عيّن الرئيس والمقرر حتى يصبح المجلس جاهزاً." />}</div>;
}

function MemberCard({ memberships, archived, onEdit, onEnd }: { memberships: CouncilMembership[]; archived: boolean; onEdit: (membership: CouncilMembership) => void; onEnd: (membership: CouncilMembership) => void }) {
  const person = memberships[0];
  const effective = memberships.some((membership) => membership.is_effective);
  const activeRoles = memberships.filter((membership) => membership.is_effective).length;
  return <article className={`overflow-hidden rounded-q-card border bg-q-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-sm ${effective ? "border-q-border" : "border-q-border opacity-70"}`}><header className="relative flex items-center gap-3 overflow-hidden border-b border-q-border bg-q-header p-4"><span className="absolute -left-8 -top-12 h-28 w-28 rounded-full border border-q-on-header/20" /><span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-q-card bg-q-surface/15 text-q-body font-black text-q-on-header shadow-sm">{person.full_name_ar.slice(0, 1)}</span><div className="relative min-w-0 flex-1"><strong className="block truncate text-q-ui font-black text-q-on-header">{person.full_name_ar}</strong><p className="mt-1 truncate text-q-caption font-bold text-q-on-header/75">{memberships.filter((membership) => membership.is_effective).map((membership) => membership.role_name_ar).join(" • ") || "لا توجد أدوار فعالة"}</p></div><span className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-q-caption font-black ${effective ? "bg-q-success-soft text-q-success ring-1 ring-q-success" : "bg-q-neutral-soft text-q-text-2"}`}><span className={`h-1.5 w-1.5 rounded-full ${effective ? "bg-q-success" : "bg-q-text-3"}`} />{effective ? `${activeRoles} فعال` : "منتهٍ"}</span></header><div className="space-y-2 p-3">{memberships.map((membership) => {
    const leadershipRole = isLeadershipRole(membership.role_code);
    return <div key={membership.id} className={`rounded-q-control border p-3 ${leadershipRole ? "border-q-border bg-q-surface-2" : "border-q-border bg-q-surface-2"}`}><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-q-control ${leadershipRole ? "bg-q-surface-2 text-q-text-2" : "bg-q-surface-2 text-q-primary"}`}>{leadershipRole ? <Crown size={13} /> : <UsersRound size={13} />}</span><div className="min-w-0 flex-1"><strong className={`block truncate text-q-caption font-black ${leadershipRole ? "text-q-text-2" : "text-q-text-2"}`}>{membership.membership_title || membership.role_name_ar}</strong><span className="mt-0.5 block text-q-caption text-q-text-2">{membership.role_name_ar}</span></div><span className={`rounded-full px-2 py-0.5 text-q-caption font-black ${membership.is_effective ? "bg-q-success-soft text-q-success" : "bg-q-neutral-soft text-q-text-2"}`}>{membership.is_effective ? "فعال" : "منتهٍ"}</span>{membership.membership_status === "active" && !archived && <div className="flex gap-0.5"><button type="button" onClick={() => onEdit(membership)} className="grid h-7 w-7 place-items-center rounded-q-control text-q-text-2 transition hover:bg-q-surface hover:text-q-primary hover:shadow-sm" aria-label={`تعديل دور ${membership.role_name_ar} لـ ${membership.full_name_ar}`} title="تعديل الدور"><Pencil size={13} /></button><button type="button" onClick={() => onEnd(membership)} className="grid h-7 w-7 place-items-center rounded-q-control text-q-text-2 transition hover:bg-q-danger-soft hover:text-q-danger" aria-label={`إنهاء دور ${membership.role_name_ar} لـ ${membership.full_name_ar}`} title="إنهاء الدور"><PowerOff size={13} /></button></div>}</div><div className="mt-2 flex items-center gap-1.5 border-t border-q-border pt-2 text-q-caption font-bold text-q-text-2"><CalendarDays size={11} /><span>{formatDate(membership.start_date)}</span><span className="text-q-text-2">←</span><span>{membership.end_date ? formatDate(membership.end_date) : "مستمرة"}</span></div></div>;
  })}</div></article>;
}

function ReadinessPanel({ council, readiness, onLifecycle }: { council: CouncilSummary; readiness: CouncilReadiness | null; onLifecycle: (action: Exclude<LifecycleDialog, null>) => void }) {
  const ready = readiness?.administratively_ready ?? false;
  const issues = [...(readiness?.errors ?? []), ...(readiness?.warnings ?? [])];
  return <div className="p-5"><div className={`mb-4 rounded-q-card border p-4 ${ready ? "border-q-success bg-q-success-soft" : "border-q-warning bg-q-warning-soft"}`}><div className="flex items-start gap-3">{ready ? <CheckCircle2 className="mt-0.5 text-q-success" size={21} /> : <AlertCircle className="mt-0.5 text-q-warning" size={21} />}<div className="flex-1"><strong className={`text-q-ui font-black ${ready ? "text-q-success" : "text-q-warning"}`}>{ready ? "المجلس مكتمل الجاهزية الإدارية" : "المجلس يحتاج إلى استكمال المتطلبات"}</strong><p className="mt-1 text-q-caption leading-5 opacity-75">الأعضاء الفعالون: {readiness?.active_member_count ?? 0} من أصل {readiness?.minimum_active_members ?? council.minimum_active_members} كحد أدنى.</p></div></div></div>{issues.length > 0 && <div className="mb-5 space-y-2"><h3 className="text-q-caption font-black text-q-text-2">نتائج الفحص</h3>{issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex gap-3 rounded-q-control border border-q-border bg-q-bg p-3"><AlertCircle size={15} className="mt-0.5 shrink-0 text-q-text-2" /><div><strong className="block text-q-caption font-black text-q-text-2">{issue.message}</strong></div></div>)}</div>}<div className="flex flex-wrap gap-2 border-t border-q-border pt-4">{council.status === "inactive" && <button type="button" disabled={!ready} onClick={() => onLifecycle("activate")} className="inline-flex h-11 items-center gap-2 rounded-q-control bg-q-success px-4 text-q-caption font-black text-q-on-success disabled:cursor-not-allowed disabled:bg-q-surface-2" title={!ready ? "استكمل متطلبات الجاهزية أولاً" : undefined}><Power size={15} /> تفعيل المجلس</button>}{council.status === "active" && <button type="button" onClick={() => onLifecycle("deactivate")} className="inline-flex h-11 items-center gap-2 rounded-q-control border border-q-warning bg-q-warning-soft px-4 text-q-caption font-black text-q-warning"><PowerOff size={15} /> تعطيل المجلس</button>}{council.status !== "archived" && <button type="button" onClick={() => onLifecycle("archive")} className="inline-flex h-11 items-center gap-2 rounded-q-control border border-q-danger bg-q-danger-soft px-4 text-q-caption font-black text-q-danger"><Archive size={15} /> أرشفة نهائية</button>}{council.status === "archived" && <p className="text-q-caption font-bold text-q-text-3">هذا المجلس مؤرشف نهائياً، وتبقى بياناته متاحة للرجوع والتدقيق فقط.</p>}</div></div>;
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-q-control bg-q-surface/10 px-3 text-q-caption font-black text-q-on-primary ring-1 ring-white/20 backdrop-blur hover:bg-q-surface/20"><Icon size={14} />{label}</button>; }
function Info({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) { return <div className="rounded-q-card border border-q-border bg-q-bg p-4"><span className="grid h-8 w-8 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><Icon size={15} /></span><span className="mt-3 block text-q-caption font-bold text-q-text-2">{label}</span><strong className="mt-1 block text-q-caption font-black text-q-text-2">{value}</strong></div>; }
function EmptyState({ icon: Icon, title, description }: { icon: typeof UsersRound; title: string; description: string }) { return <div className="rounded-q-card border border-dashed border-q-border bg-q-surface-2 p-8 text-center"><Icon size={30} className="mx-auto text-q-text-2" /><strong className="mt-3 block text-q-caption font-black text-q-text-2">{title}</strong><p className="mx-auto mt-2 max-w-md text-q-caption leading-5 text-q-text-2">{description}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function lifecycleTitle(action: Exclude<LifecycleDialog, null>) { return action === "activate" ? "تفعيل المجلس" : action === "deactivate" ? "تعطيل المجلس" : "أرشفة المجلس نهائياً"; }
function lifecycleDescription(action: Exclude<LifecycleDialog, null>) { return action === "activate" ? "سيصبح المجلس متاحاً للعمليات بعد التحقق النهائي من الجاهزية." : action === "deactivate" ? "سيتم إيقاف العمليات الجديدة مع إبقاء السجل محفوظاً." : "الأرشفة انتقال نهائي ولا تنجح إذا وُجدت مجالس تابعة غير مؤرشفة."; }
function isLeadershipRole(roleCode: string) { return roleCode === "council_chair" || roleCode === "council_rapporteur"; }
function toFormValues(detail: CouncilDetail): CouncilFormValues { return { nameAr: detail.name_ar, nameEn: detail.name_en ?? "", description: detail.description ?? "", unitTypeId: detail.unit_type_id, scopeUnitId: detail.scope_unit_id ?? "", governanceClassId: detail.governance_class_id ?? "", minimumActiveMembers: detail.minimum_active_members, allowDualLeadership: detail.allow_dual_leadership, createMeetingPlan: false, meetingTypeId: "", recurrence: "monthly", firstMeetingDate: "", planEndsOn: "", missedAfterDays: 7, quorumPercentage: 51 }; }
async function fetchCouncilState(): Promise<[CouncilSearchResult, CouncilHierarchyData]> {
  const data = await councilRpc<CouncilHierarchyData>("admin_get_council_organizational_tree_v2");
  if (!Array.isArray(data?.units) || !Array.isArray(data?.councils)) throw new Error("تعذر تأكيد بيانات الهيكل؛ حاول التحديث مجددًا.");
  return [{ items: data.councils, total: data.councils.length, limit: data.councils.length, offset: 0 }, data];
}
