export type RouteStage = {
  key: string;
  target_kind: "council" | "class";
  target_id: string;
};
export type RouteSpec = { name_ar: string; description: string; steps: RouteStage[] };
export type RouteOption = { id: string; name_ar: string; status?: string };
export type RouteRecord = {
  id: string; name_ar: string; reference_number?: string | null; revision: string;
  payload: RouteSpec | null; version_id: string; version_status: "draft" | "active" | "retired";
  validation_errors: string[];
  activation_issues?: string[];
  layout_only?: boolean;
  versions?: Array<{ id: string; status: string; version_no: number; steps: Array<{ id: string; name_ar: string }> }>;
};
export type RouteInventory = { items: RouteRecord[]; councils: RouteOption[]; classes: RouteOption[]; saved_id?: string; saved_version_id?: string };
export const blankRoute = (): RouteSpec => ({ name_ar: "", description: "", steps: [{ key: "s1", target_kind: "class", target_id: "" }] });

export function suggestRouteName(steps: RouteStage[], data: Pick<RouteInventory, "councils" | "classes">): string {
  const names = steps.map(step => (step.target_kind === "council" ? data.councils : data.classes)
    .find(target => target.id === step.target_id)?.name_ar.trim()).filter(Boolean);
  const name = names.length ? `مسار ${names.join(" ← ")}` : "";
  return name.length > 300 ? `${name.slice(0, 299).trimEnd()}…` : name;
}

export function verifyRouteInventory(value: RouteInventory): RouteInventory {
  if (!value || !Array.isArray(value.items) || !Array.isArray(value.councils) || !Array.isArray(value.classes)
    || value.items.some(item => !item.id || !item.revision || !Array.isArray(item.validation_errors)
      || (item.payload !== null && (!item.payload || !Array.isArray(item.payload.steps))))) {
    throw new Error("تعذر التحقق من بيانات المسارات. أعد تحميل القائمة.");
  }
  return value;
}

export function routeErrors(spec: RouteSpec, data: RouteInventory): string[] {
  const errors: string[] = [];
  if (spec.name_ar.trim().length < 3) errors.push("أدخل اسمًا واضحًا للمسار من ثلاثة أحرف على الأقل.");
  if (!spec.steps.length) errors.push("أضف مرحلة واحدة على الأقل.");
  spec.steps.forEach((step, index) => {
    if (!(step.target_kind === "council" ? data.councils : data.classes).some(target => target.id === step.target_id)) errors.push(`اختر جهة المرحلة ${index + 1}.`);
  });
  return errors;
}

// Only council order belongs to the reusable layout, not decision policies.
export function removeRouteStage(spec: RouteSpec, key: string): RouteSpec {
  const steps = spec.steps.filter(step => step.key !== key);
  return { ...spec, steps };
}
