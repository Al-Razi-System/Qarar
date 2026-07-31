"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CirclePlus,
  FilePenLine,
  KeyRound,
  Pencil,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

export type RoleRecord = {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  role_scope: string;
  permission_count: number;
  is_active?: boolean;
};

export type PermissionRecord = {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  module: string;
  action?: string;
  context_scope: string;
  description?: string | null;
  is_active?: boolean;
  is_system_permission?: boolean;
};

type RoleDetail = RoleRecord & { description?: string | null; permissions: PermissionRecord[] };
type Modal = "role" | "permission" | "request" | "deactivate" | null;

const scopeLabels: Record<string, string> = {
  system: "النظام",
  organization: "المنظمة",
  governance_unit: "وحدة الحوكمة",
  execution: "التنفيذ",
};

async function iamRequest<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin/iam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "تعذر تنفيذ العملية.");
  return data as T;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[11px] font-bold text-[#34455c]">{label}</span>{children}</label>;
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-black text-[#13233a]">{title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#7c8da0] hover:bg-[#eff5fa]" aria-label="إغلاق"><X size={18} /></button></div>{children}</div></div>;
}

export function PermissionMatrix({ roles, permissions }: { roles: RoleRecord[]; permissions: PermissionRecord[] }) {
  const [tab, setTab] = useState<"roles" | "permissions">("roles");
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [roleDetail, setRoleDetail] = useState<RoleDetail | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [editingPermission, setEditingPermission] = useState<PermissionRecord | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [roleForm, setRoleForm] = useState({ code: "", name_ar: "", name_en: "", description: "", scope: "governance_unit" });
  const [permissionForm, setPermissionForm] = useState({ code: "", module: "", action: "", scope: "governance_unit", name_ar: "", name_en: "", description: "" });
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [justification, setJustification] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");

  useEffect(() => {
    if (!selectedRoleId) return;
    let current = true;
    iamRequest<RoleDetail>("roleDetail", { p_role_id: selectedRoleId })
      .then((detail) => {
        if (!current) return;
        setRoleDetail(detail);
        setSelectedCodes(new Set(detail.permissions.map((permission) => permission.code)));
      })
      .catch((error: Error) => {
        if (current) setNotice({ type: "error", text: error.message });
      });
    return () => { current = false; };
  }, [selectedRoleId]);

  function openRole(role?: RoleRecord) {
    setEditingRole(role ?? null);
    setRoleForm(role ? { code: role.code, name_ar: role.name_ar, name_en: role.name_en ?? "", description: "", scope: role.role_scope } : { code: "", name_ar: "", name_en: "", description: "", scope: "governance_unit" });
    setModal("role");
  }
  function openPermission(permission?: PermissionRecord) {
    setEditingPermission(permission ?? null);
    setPermissionForm(permission ? { code: permission.code, module: permission.module, action: permission.action ?? "", scope: permission.context_scope, name_ar: permission.name_ar, name_en: permission.name_en ?? "", description: permission.description ?? "" } : { code: "", module: "", action: "", scope: "governance_unit", name_ar: "", name_en: "", description: "" });
    setModal("permission");
  }
  async function saveRole() {
    if (!/^[a-z][a-z0-9_.-]*$/.test(roleForm.code.trim()) || !roleForm.name_ar.trim()) { setNotice({ type: "error", text: "أدخل رمز دور إنجليزيًا صحيحًا واسمًا عربيًا للدور." }); return; }
    setIsSaving(true); setNotice(null);
    try {
      await iamRequest("upsertRole", { p_role_id: editingRole?.id ?? null, p_code: roleForm.code, p_name_ar: roleForm.name_ar, p_name_en: roleForm.name_en || null, p_description: roleForm.description || null, p_role_scope: roleForm.scope, p_is_active: true });
      setModal(null); setNotice({ type: "success", text: "تم حفظ الدور." }); window.location.reload();
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "تعذر الحفظ." }); } finally { setIsSaving(false); }
  }
  async function savePermission() {
    if (!/^[a-z][a-z0-9_.-]*$/.test(permissionForm.code.trim()) || !permissionForm.module.trim() || !permissionForm.action.trim() || !permissionForm.name_ar.trim()) { setNotice({ type: "error", text: "أكمل رمز الصلاحية والموديول والإجراء والاسم العربي بصيغة صحيحة." }); return; }
    setIsSaving(true); setNotice(null);
    try {
      await iamRequest("upsertPermission", { p_code: permissionForm.code, p_module: permissionForm.module, p_action: permissionForm.action, p_context_scope: permissionForm.scope, p_name_ar: permissionForm.name_ar, p_name_en: permissionForm.name_en || null, p_description: permissionForm.description || null, p_is_active: true });
      setModal(null); setNotice({ type: "success", text: "تم حفظ الصلاحية." }); window.location.reload();
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "تعذر الحفظ." }); } finally { setIsSaving(false); }
  }
  async function submitRoleChange() {
    if (!roleDetail || !justification.trim()) { setNotice({ type: "error", text: "أدخل مبرر طلب التغيير." }); return; }
    setIsSaving(true); setNotice(null);
    try {
      await iamRequest("requestRoleChange", { p_role_id: roleDetail.id, p_permission_codes: Array.from(selectedCodes), p_justification: justification.trim() });
      setModal(null); setNotice({ type: "success", text: "تم إرسال طلب التغيير للمراجعة المستقلة." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "تعذر إرسال الطلب." }); } finally { setIsSaving(false); }
  }
  async function deactivateRole() {
    if (!roleDetail || !deactivateReason.trim()) { setNotice({ type: "error", text: "أدخل سبب التعطيل." }); return; }
    setIsSaving(true); setNotice(null);
    try {
      await iamRequest("deactivateRole", { p_role_id: roleDetail.id, p_reason: deactivateReason.trim() });
      setModal(null); setNotice({ type: "success", text: "تم تعطيل الدور مع الاحتفاظ بالسجل." }); window.location.reload();
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "تعذر تعطيل الدور." }); } finally { setIsSaving(false); }
  }

  return <>
    {notice && <div className={`mb-5 rounded-xl border px-4 py-3 text-xs ${notice.type === "success" ? "border-[#bfe9d9] bg-[#ecfaf4] text-[#167957]" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2e9f1] bg-white p-2">
      <div className="flex gap-1"><button onClick={() => setTab("roles")} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${tab === "roles" ? "bg-[#0066cc] text-white" : "text-[#65768b] hover:bg-[#f3f7fb]"}`}>الأدوار ({roles.length})</button><button onClick={() => setTab("permissions")} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${tab === "permissions" ? "bg-[#0066cc] text-white" : "text-[#65768b] hover:bg-[#f3f7fb]"}`}>الصلاحيات ({permissions.length})</button></div>
      <button onClick={() => tab === "roles" ? openRole() : openPermission()} className="flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white"><CirclePlus size={16} />{tab === "roles" ? "إنشاء دور" : "إنشاء صلاحية"}</button>
    </div>

    {tab === "roles" ? <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-[#e2e9f1] bg-white"><div className="border-b border-[#edf1f5] p-5"><h2 className="text-sm font-black text-[#16243b]">الأدوار</h2><p className="mt-1 text-[10px] text-[#8392a5]">اختر دورًا لعرض مصفوفته.</p></div><div className="divide-y divide-[#edf1f5]">{roles.map((role) => <button key={role.id} onClick={() => setSelectedRoleId(role.id)} className={`flex w-full items-center gap-3 p-4 text-right transition ${selectedRoleId === role.id ? "bg-[#edf6ff]" : "hover:bg-[#f8fafc]"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${selectedRoleId === role.id ? "bg-[#0066cc] text-white" : "bg-[#edf1f5] text-[#708196]"}`}><ShieldCheck size={17} /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-[#1d2c43]">{role.name_ar}</strong><span className="mt-1 block truncate text-[9px] text-[#8b9aad]">{role.code} · {role.permission_count} صلاحية</span></span></button>)}</div></aside>
      <section className="overflow-hidden rounded-2xl border border-[#e2e9f1] bg-white">{roleDetail ? <><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf1f5] p-5"><div><div className="flex items-center gap-2"><h2 className="text-base font-black text-[#14233a]">{roleDetail.name_ar}</h2><span className="rounded-full bg-[#edf5fd] px-2 py-1 text-[9px] font-bold text-[#0066cc]">{scopeLabels[roleDetail.role_scope] ?? roleDetail.role_scope}</span></div><p className="mt-1.5 text-[10px] text-[#8493a6]">{roleDetail.code} · {roleDetail.permissions.length} صلاحية مطبقة</p></div><div className="flex gap-2"><button onClick={() => openRole(roleDetail)} className="flex h-9 items-center gap-1.5 rounded-xl border border-[#dfe7ef] px-3 text-[10px] font-bold text-[#52647a]"><Pencil size={14} />تعديل الدور</button><button onClick={() => { setDeactivateReason(""); setModal("deactivate"); }} className="flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[10px] font-bold text-[#bd3e35]"><Power size={14} />تعطيل</button></div></div><div className="m-5 flex gap-3 rounded-xl border border-[#cfe4f8] bg-[#f2f8ff] p-4 text-[11px] leading-6 text-[#416784]"><SlidersHorizontal size={17} className="mt-0.5 shrink-0 text-[#0066cc]" />تغيير المصفوفة لا يُطبّق مباشرة. حدّد الصلاحيات ثم أرسل طلب تغيير لمراجعة مسؤول آخر.</div><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{permissions.map((permission) => { const checked = selectedCodes.has(permission.code); return <button key={permission.id} onClick={() => setSelectedCodes((current) => { const next = new Set(current); if (checked) next.delete(permission.code); else next.add(permission.code); return next; })} className={`flex items-start gap-3 rounded-xl border p-3 text-right ${checked ? "border-[#9bc9f2] bg-[#f4f9ff]" : "border-[#e2e8ef] bg-white"}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? "border-[#0066cc] bg-[#0066cc] text-white" : "border-[#cbd6e2]"}`}>{checked && <Check size={13} />}</span><span><strong className="block text-[11px] text-[#27364d]">{permission.name_ar}</strong><span className="mt-1 block text-[9px] text-[#8a99ac]">{permission.code}</span></span></button>; })}</div><div className="border-t border-[#edf1f5] p-5 text-left"><button onClick={() => { setJustification(""); setModal("request"); }} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white">طلب اعتماد التغييرات</button></div></> : <div className="grid min-h-[440px] place-items-center text-xs text-[#8392a5]">اختر دورًا لعرض التفاصيل.</div>}</section>
    </div> : <section className="overflow-hidden rounded-2xl border border-[#e2e9f1] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-5 py-4"><div><h2 className="text-sm font-black text-[#16243b]">دليل الصلاحيات</h2><p className="mt-1 text-[10px] text-[#8392a5]">قائمة الصلاحيات المتاحة في المنصة وتفاصيل نطاق كل صلاحية.</p></div><span className="rounded-full bg-[#edf5fd] px-3 py-1.5 text-[10px] font-bold text-[#0066cc]">{permissions.length} صلاحية</span></div><div className="overflow-x-auto"><table className="w-full min-w-[880px] border-collapse text-right"><thead><tr className="bg-[#f8fafc] text-[10px] font-bold text-[#718196]"><th className="w-12 px-5 py-3.5">#</th><th className="px-4 py-3.5">اسم الصلاحية</th><th className="px-4 py-3.5">رمز الصلاحية</th><th className="px-4 py-3.5">الموديول</th><th className="px-4 py-3.5">النطاق</th><th className="px-4 py-3.5">الحالة</th><th className="w-20 px-4 py-3.5">إجراء</th></tr></thead><tbody>{permissions.map((permission, index) => <tr key={permission.id} className="border-t border-[#edf1f5] text-xs transition hover:bg-[#fbfdff]"><td className="px-5 py-3.5 text-[10px] font-bold text-[#9aa8b8]">{index + 1}</td><td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf5fd] text-[#0066cc]"><KeyRound size={15} /></span><span><strong className="block font-bold text-[#22334a]">{permission.name_ar}</strong>{permission.name_en && <span className="mt-0.5 block text-[9px] text-[#8c9aac]">{permission.name_en}</span>}</span></div></td><td className="px-4 py-3.5"><code dir="ltr" className="rounded-md bg-[#f2f6fa] px-2 py-1 text-[10px] text-[#526f8e]">{permission.code}</code></td><td className="px-4 py-3.5"><span className="rounded-full bg-[#f1f7fd] px-2.5 py-1 text-[10px] font-bold text-[#2770b9]">{permission.module}</span></td><td className="px-4 py-3.5 text-[11px] text-[#586a80]">{scopeLabels[permission.context_scope] ?? permission.context_scope}</td><td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${permission.is_active === false ? "bg-[#f3f5f7] text-[#77879a]" : "bg-[#e9f8f1] text-[#16835f]"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{permission.is_active === false ? "معطلة" : "نشطة"}</span></td><td className="px-4 py-3.5"><button type="button" onClick={() => openPermission(permission)} className="grid h-8 w-8 place-items-center rounded-lg text-[#6d7e91] transition hover:bg-[#edf4fb] hover:text-[#0066cc]" aria-label={`تعديل ${permission.name_ar}`}><FilePenLine size={16} /></button></td></tr>)}</tbody></table></div></section>}

    {modal === "role" && <ModalShell title={editingRole ? "تعديل الدور" : "إنشاء دور"} onClose={() => setModal(null)}><div className="grid gap-4 sm:grid-cols-2"><Field label="رمز الدور"><input disabled={Boolean(editingRole)} value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none disabled:bg-[#f3f6f9]" /></Field><Field label="نطاق الدور"><select value={roleForm.scope} onChange={(e) => setRoleForm({ ...roleForm, scope: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none"><option value="system">النظام</option><option value="organization">المنظمة</option><option value="governance_unit">وحدة الحوكمة</option><option value="execution">التنفيذ</option></select></Field><Field label="الاسم بالعربية"><input value={roleForm.name_ar} onChange={(e) => setRoleForm({ ...roleForm, name_ar: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" /></Field><Field label="الاسم بالإنجليزية"><input value={roleForm.name_en} onChange={(e) => setRoleForm({ ...roleForm, name_en: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" dir="ltr" /></Field></div><Field label="الوصف"><textarea value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-[#dce5ef] p-3 text-xs outline-none" /></Field><div className="mt-6 flex justify-end gap-2"><button onClick={() => setModal(null)} className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button onClick={saveRole} disabled={isSaving} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white">{isSaving ? "جارٍ الحفظ..." : "حفظ الدور"}</button></div></ModalShell>}
    {modal === "permission" && <ModalShell title={editingPermission ? "تعديل الصلاحية" : "إنشاء صلاحية"} onClose={() => setModal(null)}><div className="grid gap-4 sm:grid-cols-2"><Field label="رمز الصلاحية"><input value={permissionForm.code} onChange={(e) => setPermissionForm({ ...permissionForm, code: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" dir="ltr" /></Field><Field label="الموديول"><input value={permissionForm.module} onChange={(e) => setPermissionForm({ ...permissionForm, module: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" dir="ltr" /></Field><Field label="الإجراء"><input value={permissionForm.action} onChange={(e) => setPermissionForm({ ...permissionForm, action: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" dir="ltr" /></Field><Field label="نطاق الصلاحية"><select value={permissionForm.scope} onChange={(e) => setPermissionForm({ ...permissionForm, scope: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none"><option value="system">النظام</option><option value="organization">المنظمة</option><option value="governance_unit">وحدة الحوكمة</option><option value="execution">التنفيذ</option></select></Field><Field label="الاسم بالعربية"><input value={permissionForm.name_ar} onChange={(e) => setPermissionForm({ ...permissionForm, name_ar: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" /></Field><Field label="الاسم بالإنجليزية"><input value={permissionForm.name_en} onChange={(e) => setPermissionForm({ ...permissionForm, name_en: e.target.value })} className="h-11 w-full rounded-xl border border-[#dce5ef] px-3 text-xs outline-none" dir="ltr" /></Field></div><Field label="الوصف"><textarea value={permissionForm.description} onChange={(e) => setPermissionForm({ ...permissionForm, description: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-[#dce5ef] p-3 text-xs outline-none" /></Field><div className="mt-6 flex justify-end gap-2"><button onClick={() => setModal(null)} className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button onClick={savePermission} disabled={isSaving} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white">{isSaving ? "جارٍ الحفظ..." : "حفظ الصلاحية"}</button></div></ModalShell>}
    {modal === "request" && <ModalShell title="طلب اعتماد تغيير الصلاحيات" onClose={() => setModal(null)}><p className="text-xs leading-6 text-[#718196]">لن تُطبّق التغييرات حتى يوافق عليها مسؤول آخر غير مقدم الطلب.</p><Field label="مبرر التغيير"><textarea value={justification} onChange={(e) => setJustification(e.target.value)} className="mt-3 min-h-28 w-full rounded-xl border border-[#dce5ef] p-3 text-xs outline-none" placeholder="اكتب سببًا واضحًا ومبررًا للتغيير..." /></Field><div className="mt-6 flex justify-end gap-2"><button onClick={() => setModal(null)} className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button onClick={submitRoleChange} disabled={isSaving} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white">{isSaving ? "جارٍ الإرسال..." : "إرسال للمراجعة"}</button></div></ModalShell>}
    {modal === "deactivate" && <ModalShell title="تعطيل الدور" onClose={() => setModal(null)}><p className="text-xs leading-6 text-[#718196]">لن يُحذف الدور؛ سيبقى السجل محفوظًا لأغراض الحوكمة والتدقيق.</p><Field label="سبب التعطيل"><textarea value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} className="mt-3 min-h-24 w-full rounded-xl border border-red-200 p-3 text-xs outline-none" /></Field><div className="mt-6 flex justify-end gap-2"><button onClick={() => setModal(null)} className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button onClick={deactivateRole} disabled={isSaving} className="h-10 rounded-xl bg-[#bd3e35] px-4 text-xs font-bold text-white">{isSaving ? "جارٍ التعطيل..." : "تعطيل الدور"}</button></div></ModalShell>}
  </>;
}
