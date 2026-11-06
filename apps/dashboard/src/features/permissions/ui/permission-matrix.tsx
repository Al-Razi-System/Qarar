"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import {
  AdministrativeInput,
  AdministrativeSelect,
  AdministrativeTextArea,
} from "@/shared/ui/administrative-field";
import { arabicName, moduleLabel, scopeLabels } from "../model/presentation";

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
type RoleDetail = RoleRecord & {
  description?: string | null;
  permissions: PermissionRecord[];
};
type Notice = { tone: "error" | "success" | "info"; text: string };
type Editor =
  "new" | "metadata" | "review" | "deactivate" | "reactivate" | null;
async function request<T>(
  operation: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/admin/iam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, payload }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === "string" && /[\u0600-\u06ff]/.test(data.message)
        ? data.message
        : "تعذر تنفيذ العملية. أعد تحميل البيانات.",
    );
  return data as T;
}
export function PermissionMatrix({
  roles,
  permissions,
  canManageRoles = false,
  canManagePermissions = false,
}: {
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  canManageRoles?: boolean;
  canManagePermissions?: boolean;
}) {
  const [tab, setTab] = useState<"roles" | "catalog">("roles");
  const [list, setList] = useState(roles);
  const [id, setId] = useState(roles[0]?.id ?? "");
  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "governance_unit",
  });
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setLoading(Boolean(id));
      setDetail(null);
      if (!id) return;
      void request<RoleDetail>("roleDetail", { p_role_id: id })
        .then((value) => {
          if (!current) return;
          if (value.id !== id || !Array.isArray(value.permissions))
            throw new Error("تعذر قراءة بيانات الدور.");
          setDetail(value);
          setSelected(new Set(value.permissions.map((p) => p.code)));
          setLoading(false);
        })
        .catch(() => {
          if (current) {
            setLoading(false);
            setNotice({
              tone: "error",
              text: "تعذر تحميل صلاحيات الدور. أعد المحاولة.",
            });
          }
        });
    });
    return () => {
      current = false;
    };
  }, [id, retry]);
  const applied = useMemo(
    () => new Set(detail?.permissions.map((p) => p.code) ?? []),
    [detail],
  );
  const added = permissions.filter(
    (p) => selected.has(p.code) && !applied.has(p.code),
  );
  const removed =
    detail?.permissions.filter((p) => !selected.has(p.code)) ?? [];
  const dirty = Boolean(detail) && added.length + removed.length > 0;
  const visible = permissions.filter(
    (p) =>
      p.is_active !== false && arabicName(p.name_ar).includes(search.trim()),
  );
  const groups = visible.reduce<Record<string, PermissionRecord[]>>(
    (result, p) => {
      (result[moduleLabel(p.module)] ??= []).push(p);
      return result;
    },
    {},
  );
  const editable =
    canManagePermissions &&
    detail?.is_active !== false &&
    !busy &&
    !uncertain &&
    editor === null;
  const fitsRole = (permission: PermissionRecord) =>
    permission.context_scope === "system"
      ? detail?.role_scope === "system"
      : permission.context_scope !== "organization" ||
        ["organization", "system"].includes(detail?.role_scope ?? "");
  const groupExpanded = (group: string, items: PermissionRecord[]) =>
    Boolean(search.trim()) ||
    (expanded[group] ?? items.some((p) => applied.has(p.code)));
  function chooseRole(next: string) {
    if (next === id) return;
    if (dirty || editor) {
      setPendingRole(next);
      return;
    }
    setDetail(null);
    setId(next);
    setEditor(null);
    setNotice(null);
  }
  function openMetadata(create: boolean) {
    setNotice(null);
    setReason("");
    setForm(
      create
        ? { name: "", description: "", scope: "governance_unit" }
        : {
            name: detail?.name_ar ?? "",
            description: detail?.description ?? "",
            scope: detail?.role_scope ?? "governance_unit",
          },
    );
    setEditor(create ? "new" : "metadata");
  }
  async function mutate(
    operation: string,
    payload: Record<string, unknown>,
    success: string,
  ) {
    if (guard.current || uncertain) return;
    guard.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const receipt = await request<unknown>(operation, payload);
      if (
        operation === "upsertRole" &&
        typeof receipt !== "string"
      )
        throw new Error("تعذر التأكد من نتيجة الحفظ.");
      if (operation === "upsertRole") {
        const role = {
          id: receipt as string,
          code: editor === "new" ? "" : (detail?.code ?? ""),
          name_ar: form.name.trim(),
          role_scope: form.scope,
          permission_count:
            editor === "new" ? 0 : (detail?.permissions.length ?? 0),
          is_active: payload.p_is_active !== false,
        };
        setList((previous) => [
          ...previous.filter((r) => r.id !== role.id),
          role,
        ]);
        setId(role.id);
        setDetail({
          ...role,
          description: form.description,
          permissions: editor === "new" ? [] : (detail?.permissions ?? []),
        });
        if (editor === "new") setSelected(new Set());
      } else if (
        operation === "deactivateRole" ||
        operation === "reactivateRole"
      ) {
        const isActive = operation === "reactivateRole";
        setList((previous) =>
          previous.map((r) =>
            r.id === id ? { ...r, is_active: isActive } : r,
          ),
        );
        setDetail((value) =>
          value ? { ...value, is_active: isActive } : null,
        );
      } else if (operation === "saveRolePermissions") {
        const saved = receipt as { saved?: boolean; role_id?: string; permission_codes?: string[] };
        if (!saved?.saved || saved.role_id !== id || !Array.isArray(saved.permission_codes)
          || saved.permission_codes.length !== selected.size || saved.permission_codes.some((code) => !selected.has(code)))
          throw new Error("تعذر التأكد من نتيجة الحفظ. أعد تحميل الدور.");
        const currentPermissions = permissions.filter((p) => saved.permission_codes!.includes(p.code));
        setDetail((value) => value ? { ...value, permissions: currentPermissions } : null);
        setList((previous) => previous.map((r) => r.id === id ? { ...r, permission_count: currentPermissions.length } : r));
        setSelected(new Set(saved.permission_codes));
      }
      setEditor(null);
      setReason("");
      setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
            ? error.message
            : "تعذر التأكد من نتيجة العملية. تحقق قبل إعادة المحاولة.",
      });
      setUncertain(true);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function saveMetadata() {
    if (!form.name.trim()) {
      setNotice({ tone: "error", text: "اكتب اسمًا واضحًا للدور." });
      return;
    }
    void mutate(
      "upsertRole",
      {
        p_role_id: editor === "new" ? null : detail?.id,
        p_name_ar: form.name.trim(),
        p_description: form.description.trim() || null,
        p_role_scope: form.scope,
        p_is_active: editor === "new" ? true : detail?.is_active !== false,
      },
      "تم حفظ بيانات الدور. اختر صلاحياته من القائمة.",
    );
  }
  return (
    <div className="space-y-6 text-q-text" dir="rtl">
      <Card className="flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="rounded-q-card bg-q-surface-2 p-3 text-q-primary">
            <ShieldCheck size={28} aria-hidden />
          </span>
          <div>
            <p className="text-q-caption text-q-text-2">إدارة الوصول</p>
            <h1 className="mt-1 text-q-h1 font-bold">الأدوار والصلاحيات</h1>
            <p className="mt-2 max-w-2xl text-q-ui text-q-text-2">
              حدّد ما يستطيع كل دور فعله، ثم أسنده للمستخدم داخل مجالسه أو جهة
              عمله.
            </p>
          </div>
        </div>
        {canManageRoles && (
          <Button
            onClick={() => openMetadata(true)}
            disabled={busy || uncertain || dirty}
          >
            <Plus size={18} aria-hidden />
            إضافة دور
          </Button>
        )}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl
          label="عرض إدارة الوصول"
          options={[
            { value: "roles", label: "الأدوار" },
            { value: "catalog", label: "دليل الصلاحيات" },
          ]}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setEditor(null);
          }}
          disabled={busy || Boolean(editor)}
        />
        <span className="text-q-caption text-q-text-2">
          {list.length} أدوار · {permissions.length} صلاحية متاحة
        </span>
      </div>
      {pendingRole && (
        <Card className="space-y-4">
          <InlineMessage>
            لديك تعديلات غير محفوظة. هل تريد تركها والانتقال للدور الآخر؟
          </InlineMessage>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setPendingRole(null)}>
              متابعة التعديل
            </Button>
            <Button
              onClick={() => {
                setId(pendingRole);
                setDetail(null);
                setEditor(null);
                setPendingRole(null);
                setNotice(null);
              }}
            >
              ترك التعديلات والانتقال
            </Button>
          </div>
        </Card>
      )}
      <div
        className={
          tab === "roles"
            ? "grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
            : ""
        }
      >
        {tab === "roles" && (
          <Card className="min-w-0 space-y-4 p-4 lg:sticky lg:top-6">
            <h2 className="text-q-h3 font-bold">الأدوار</h2>
            <AdministrativeInput
              label="البحث عن دور"
              placeholder="اسم الدور…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <nav aria-label="اختيار الدور" className="space-y-2">
              {list
                .filter((r) => r.name_ar.includes(query.trim()))
                .map((role) => (
                  <Button
                    key={role.id}
                    variant="ghost"
                    disabled={busy || uncertain}
                    aria-current={id === role.id ? "true" : undefined}
                    onClick={() => chooseRole(role.id)}
                    className={`w-full justify-between border px-3 py-4 text-start ${id === role.id ? "border-q-primary bg-q-surface-2" : "border-transparent"}`}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-q-ui font-bold">
                        {role.name_ar}
                      </span>
                      <span className="mt-1 block text-q-caption font-normal text-q-text-2">
                        {scopeLabels[role.role_scope] ?? "نطاق محدد"}
                      </span>
                      <span className="mt-2 block text-q-caption font-normal text-q-text-2">
                        {role.permission_count} صلاحية ·{" "}
                        {role.is_active === false ? "معطل" : "نشط"}
                      </span>
                    </span>
                    <ChevronLeft size={16} className="shrink-0" aria-hidden />
                  </Button>
                ))}
              {!list.filter((r) => r.name_ar.includes(query.trim())).length && (
                <p className="py-6 text-q-ui text-q-text-2">
                  لا توجد أدوار مطابقة.
                </p>
              )}
            </nav>
          </Card>
        )}
        <div className="min-w-0 space-y-4">
          {editor === "new" || editor === "metadata" ? (
            <Card className="space-y-6 p-6 sm:p-8">
              <div>
                <Badge tone="info">بيانات الدور</Badge>
                <h2 className="mt-3 text-q-h2 font-bold">
                  {editor === "new" ? "دور جديد لفريقك" : "تعديل بيانات الدور"}
                </h2>
                <p className="mt-2 text-q-ui text-q-text-2">
                  اكتب اسمًا يعكس المسؤولية. ستختار الصلاحيات بعد حفظ البيانات.
                </p>
              </div>
              <AdministrativeInput
                label="اسم الدور"
                placeholder="مثل: منسق الاجتماعات"
                value={form.name}
                disabled={busy}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {editor === "new" ? (
                <AdministrativeSelect
                  label="أين يُستخدم الدور؟"
                  value={form.scope}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                >
                  <option value="governance_unit">
                    داخل المجالس المحددة للمستخدم
                  </option>
                  <option value="organization">على مستوى المؤسسة</option>
                  <option value="execution">داخل الأعمال المكلّف بها</option>
                </AdministrativeSelect>
              ) : (
                <InlineMessage>
                  {scopeLabels[form.scope] ?? "نطاق محدد"} — تغيير الاسم لا
                  يغيّر نطاق الدور.
                </InlineMessage>
              )}
              <AdministrativeTextArea
                label="وصف المسؤوليات"
                hint="اختياري؛ يساعدك على اختيار الدور الصحيح عند إضافة المستخدمين."
                value={form.description}
                disabled={busy}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              {notice && (
                <InlineMessage tone={notice.tone}>{notice.text}</InlineMessage>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={saveMetadata}
                  pending={busy}
                  disabled={uncertain}
                  pendingLabel="جارٍ الحفظ…"
                >
                  حفظ بيانات الدور
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || uncertain}
                  onClick={() => setEditor(null)}
                >
                  إلغاء
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {notice && (
                <InlineMessage tone={notice.tone}>{notice.text}</InlineMessage>
              )}
              {tab === "roles" && loading && (
                <Card>
                  <p role="status" className="text-q-ui">
                    جارٍ تحميل صلاحيات الدور…
                  </p>
                </Card>
              )}
              {tab === "roles" && !loading && !detail && (
                <Card className="space-y-4">
                  <p className="text-q-ui text-q-text-2">
                    {id
                      ? "لم تُحمّل بيانات الدور، ولا يمكن تعديلها الآن."
                      : "أضف دورًا للبدء، أو تصفّح دليل الصلاحيات."}
                  </p>
                  {id && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setNotice(null);
                        setRetry((r) => r + 1);
                      }}
                    >
                      إعادة المحاولة
                    </Button>
                  )}
                </Card>
              )}
              {(tab === "catalog" || (detail && !loading)) &&
                editor !== "review" && (
                  <>
                    <Card className="space-y-5 p-6 sm:p-8">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <Badge
                            tone={
                              tab === "catalog"
                                ? "info"
                                : detail?.is_active === false
                                  ? "neutral"
                                  : "success"
                            }
                          >
                            {tab === "catalog"
                              ? "للاطلاع"
                              : detail?.is_active === false
                                ? "دور معطل"
                                : "دور نشط"}
                          </Badge>
                          <h2 className="mt-3 text-q-h2 font-bold">
                            {tab === "catalog"
                              ? "ماذا يمكن للأدوار أن تفعل؟"
                              : detail?.name_ar}
                          </h2>
                          <p className="mt-2 text-q-ui text-q-text-2">
                            {tab === "catalog"
                              ? "صلاحيات جاهزة منظّمة حسب مجال العمل، دون إدخال تفاصيل تقنية."
                              : (scopeLabels[detail?.role_scope ?? ""] ??
                                "نطاق محدد")}
                          </p>
                          {detail?.description &&
                            /[\u0600-\u06ff]/.test(detail.description) &&
                            tab === "roles" && (
                              <p className="mt-2 text-q-ui text-q-text-2">
                                {detail.description}
                              </p>
                            )}
                        </div>
                        {tab === "roles" && canManageRoles && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              disabled={busy || uncertain || dirty}
                              onClick={() => openMetadata(false)}
                            >
                              تعديل البيانات
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy || uncertain || dirty}
                              onClick={() => {
                                setReason("");
                                setEditor(
                                  detail?.is_active === false
                                    ? "reactivate"
                                    : "deactivate",
                                );
                              }}
                            >
                              {detail?.is_active === false
                                ? "إعادة تفعيل الدور"
                                : "تعطيل الدور"}
                            </Button>
                          </div>
                        )}
                      </div>
                      {tab === "roles" && !canManagePermissions && (
                        <InlineMessage>
                          لديك صلاحية الاطلاع فقط على إعدادات الصلاحيات.
                        </InlineMessage>
                      )}
                      {tab === "roles" && detail?.is_active === false && (
                        <InlineMessage>
                          الدور معطل؛ لا يمكن إرسال تغيير صلاحياته من هذه
                          الشاشة.
                        </InlineMessage>
                      )}
                      <AdministrativeInput
                        label="البحث عن صلاحية"
                        placeholder="مثل: عرض الاجتماعات"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </Card>
                    {!permissions.some((p) => p.module === "meetings") && (
                      <InlineMessage>
                        دليل الصلاحيات في هذه البيئة غير مكتمل؛ صلاحيات
                        الاجتماعات غير متاحة للاختيار. يلزم استكمال تهيئة
                        النظام، لا إدخال رموز يدويًا.
                      </InlineMessage>
                    )}
                    {!visible.length && (
                      <Card>
                        <p className="text-q-ui text-q-text-2">
                          لا توجد صلاحيات مطابقة للبحث.
                        </p>
                      </Card>
                    )}
                    {Object.entries(groups).map(([group, items]) => (
                      <Card key={group} className="overflow-hidden p-0">
                        <h3 aria-label={group}>
                          <Button
                            variant="ghost"
                            aria-expanded={groupExpanded(group, items)}
                            aria-controls={`permission-group-${items[0].id}`}
                            onClick={() =>
                              setExpanded((previous) => ({
                                ...previous,
                                [group]: !groupExpanded(group, items),
                              }))
                            }
                            className="w-full justify-between gap-3 rounded-none bg-q-surface-2 px-5 py-4 text-q-text"
                          >
                            <span className="text-q-h3 font-bold">{group}</span>
                            <span className="flex items-center gap-3">
                              <Badge>
                                {tab === "catalog"
                                  ? `${items.length} صلاحية`
                                  : `${items.filter((p) => selected.has(p.code)).length} من ${items.length}`}
                              </Badge>
                              <ChevronDown
                                size={18}
                                className={
                                  groupExpanded(group, items)
                                    ? "rotate-180"
                                    : ""
                                }
                                aria-hidden
                              />
                            </span>
                          </Button>
                        </h3>
                        {groupExpanded(group, items) && (
                          <div
                            id={`permission-group-${items[0].id}`}
                            className="grid border-t border-q-border sm:grid-cols-2"
                          >
                            {items.map((p) => (
                              <label
                                key={p.id}
                                className={`flex min-h-16 items-start gap-4 border-b border-q-border px-5 py-4 ${tab === "roles" && editable ? "cursor-pointer hover:bg-q-surface-2" : ""}`}
                              >
                                {tab === "roles" && (
                                  <input
                                    type="checkbox"
                                    checked={selected.has(p.code)}
                                    disabled={!editable || (!fitsRole(p) && !selected.has(p.code))}
                                    onChange={() =>
                                      setSelected((previous) => {
                                        const next = new Set(previous);
                                        if (next.has(p.code))
                                          next.delete(p.code);
                                        else next.add(p.code);
                                        return next;
                                      })
                                    }
                                    className="mt-1 h-5 w-5 shrink-0 accent-q-primary"
                                  />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block text-q-ui font-bold">
                                    {arabicName(p.name_ar)}
                                  </span>
                                  <span className="mt-1 block text-q-caption text-q-text-2">
                                    {scopeLabels[p.context_scope] ??
                                      "ضمن النطاق المحدد"}
                                  </span>
                                  {tab === "roles" && !fitsRole(p) && (
                                    <span className="mt-1 block text-q-caption text-q-text-2">
                                      تحتاج دورًا على مستوى المؤسسة، وليس دورًا محصورًا في مجلس.
                                    </span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                    {tab === "roles" && canManagePermissions && (
                      <Card className="flex flex-wrap items-center justify-between gap-4 border-q-border-strong">
                        <div>
                          <p className="text-q-ui font-bold">
                            {dirty
                              ? `${added.length} إضافة · ${removed.length} سحب`
                              : "الصلاحيات الحالية"}
                          </p>
                          <p className="mt-1 text-q-caption text-q-text-2">
                            {dirty
                              ? "يطبّق الحفظ التغيير مباشرة على حاملي الدور."
                              : "حدّد ما يحتاجه الدور فقط، دون صلاحيات إضافية."}
                          </p>
                        </div>
                        <Button
                          disabled={!dirty || !editable}
                          onClick={() => {
                            setReason("");
                            setNotice(null);
                            setEditor("review");
                          }}
                        >
                          مراجعة التغييرات
                        </Button>
                      </Card>
                    )}
                  </>
                )}
            </>
          )}
          {editor === "review" && (
            <Card className="space-y-5 p-6">
              <h2 className="text-q-h2 font-bold">راجع أثر التغيير</h2>
              <p className="text-q-ui text-q-text-2">
                عند الحفظ، يتأثر جميع حاملي الدور داخل نطاقاتهم مباشرة.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-q-h3 font-bold">صلاحيات ستُضاف</h3>
                  <ul className="mt-3 space-y-2 text-q-ui">
                    {added.map((p) => (
                      <li key={p.id}>{arabicName(p.name_ar)}</li>
                    ))}
                    {!added.length && <li>لا توجد إضافات</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="text-q-h3 font-bold">صلاحيات ستُسحب</h3>
                  <ul className="mt-3 space-y-2 text-q-ui">
                    {removed.map((p) => (
                      <li key={p.id}>{arabicName(p.name_ar)}</li>
                    ))}
                    {!removed.length && <li>لا يوجد سحب</li>}
                  </ul>
                </div>
              </div>
              <AdministrativeTextArea
                label="سبب التغيير"
                hint="اختياري؛ يُحفظ في سجل التغييرات."
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
              <InlineMessage>
                مسؤول النظام يحفظ الصلاحيات مباشرة، مع تسجيل الإضافات والسحب.
              </InlineMessage>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!dirty || uncertain}
                  pending={busy}
                  pendingLabel="جارٍ حفظ الصلاحيات…"
                  onClick={() =>
                    void mutate(
                      "saveRolePermissions",
                      {
                        p_role_id: detail?.id,
                        p_permission_codes: [...selected],
                        p_expected_permission_codes: [...applied],
                        p_request_id: crypto.randomUUID(),
                        p_reason: reason.trim() || null,
                      },
                      "تم حفظ الصلاحيات وتطبيقها مباشرة.",
                    )
                  }
                >
                  حفظ الصلاحيات
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || uncertain}
                  onClick={() => setEditor(null)}
                >
                  العودة للاختيارات
                </Button>
              </div>
            </Card>
          )}
          {editor === "deactivate" && (
            <Card className="space-y-4">
              <h2 className="text-q-h2 font-bold">تعطيل {detail?.name_ar}</h2>
              <InlineMessage>
                سيتوقف أثر هذا الدور على مستخدميه. لا تُحذف حساباتهم أو أدوارهم
                الأخرى.
              </InlineMessage>
              <AdministrativeTextArea
                label="سبب التعطيل"
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  disabled={!reason.trim() || uncertain}
                  pending={busy}
                  onClick={() =>
                    void mutate(
                      "deactivateRole",
                      { p_role_id: detail?.id, p_reason: reason.trim() },
                      "تم تعطيل الدور مع الاحتفاظ بسجله.",
                    )
                  }
                >
                  تأكيد تعطيل الدور
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || uncertain}
                  onClick={() => setEditor(null)}
                >
                  إلغاء
                </Button>
              </div>
              {!reason.trim() && (
                <p className="text-q-caption text-q-text-2">
                  اكتب سبب التعطيل أولًا.
                </p>
              )}
            </Card>
          )}
          {editor === "reactivate" && (
            <Card className="space-y-4">
              <h2 className="text-q-h2 font-bold">
                إعادة تفعيل {detail?.name_ar}
              </h2>
              <InlineMessage>
                ستعود صلاحيات الدور السابقة لحاملي عضوياته السارية. لا تتغير
                الأدوار الأخرى أو حالة الحسابات.
              </InlineMessage>
              <div className="flex flex-wrap gap-3">
                <Button
                  pending={busy}
                  disabled={uncertain}
                  onClick={() =>
                    void mutate(
                      "reactivateRole",
                      { p_role_id: detail?.id },
                      "تمت إعادة تفعيل الدور بصلاحياته السابقة.",
                    )
                  }
                >
                  تأكيد إعادة التفعيل
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || uncertain}
                  onClick={() => setEditor(null)}
                >
                  إلغاء
                </Button>
              </div>
            </Card>
          )}
          {uncertain && (
            <Card className="space-y-3">
              <InlineMessage>
                أعد تحميل الدور للتحقق من صلاحياته قبل تكرار العملية؛ قد تكون نُفذت
                رغم انقطاع الرد.
              </InlineMessage>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                إعادة تحميل البيانات
              </Button>
            </Card>
          )}
        </div>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-4 bg-q-surface-2">
        <div>
          <h2 className="text-q-ui font-bold">إسناد الأدوار للمستخدمين</h2>
          <p className="mt-1 text-q-caption text-q-text-2">
            اختر الدور والمجلس من إدارة المستخدمين. نطاق تقديم الموضوع إعداد
            مستقل.
          </p>
        </div>
        <a
          href="/admin/users"
          className="inline-flex min-h-11 items-center gap-2 text-q-ui font-bold text-q-link"
        >
          إدارة المستخدمين
          <ChevronLeft size={18} aria-hidden />
        </a>
      </Card>
    </div>
  );
}
