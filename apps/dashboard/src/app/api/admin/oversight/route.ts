import { NextResponse } from "next/server";
import { QararApiError, qararRpcV2 } from "@/shared/api/qarar-server";
import { logEvent } from "@/shared/observability/logger";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const contracts = new Set([
  "admin_get_oversight_workspace_v2",
  "admin_preview_oversight_v2",
  "admin_save_oversight_assignment_v2",
  "admin_end_oversight_assignment_v2",
  "get_my_oversight_scope_v2",
  "get_my_oversight_violations_v2",
  "admin_get_oversight_rules_v2",
  "admin_save_oversight_rules_v2",
]);

/** Database validation messages mapped to what the administrator can act on. */
const validationMessages: Array<[RegExp, string]> = [
  [/holder user/, "اختر الشخص الذي سيتابع."],
  [/holder position/, "اختر المنصب."],
  [/holder council class/, "اختر نوع المجلس الذي يشغل أصحابه المنصب."],
  [/holder council/, "اختر المجلس الذي يُشغل فيه المنصب."],
  [/root unit/, "اختر الوحدة التي تبدأ منها المتابعة."],
  [/council class is not/, "نوع مجلس مختار لم يعد موجودًا. أعد تحميل الصفحة."],
  [/at least one council/, "اختر مجلسًا واحدًا على الأقل."],
  [/council is not in this organisation/, "مجلس مختار لا ينتمي إلى مؤسستك."],
  [/end precedes/, "تاريخ النهاية قبل تاريخ البداية."],
  [/title is too long/, "العنوان أطول من 200 حرف."],
  [/end reason/, "اكتب سبب إنهاء المتابعة."],
  [/already ended|ended oversight/, "هذا التعيين منتهٍ ولا يمكن تعديله."],
  [/identifier or date|holder kind|target mode|definition must/, "بيانات التعيين غير مكتملة. راجع الحقول."],
  [/invalid oversight rule value/, "قيمة غير صالحة: مهلة التجاوز من 0 إلى 365 يومًا، ومهلة التصعيد من 1 إلى 90 يومًا."],
  [/unknown oversight rule|rules must be a list/, "قاعدة غير معروفة. أعد تحميل الصفحة."],
  [/invalid violation status/, "حالة غير صالحة."],
];

function failure(error: unknown, contract: string) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: 401, message: "انتهت الجلسة. سجّل الدخول مرة أخرى." };
  }
  if (error instanceof QararApiError) {
    if (error.code === "42501" || error.status === 403) return { status: 403, message: "لا تملك صلاحية إدارة متابعة المجالس." };
    if (error.code === "40001") return { status: 409, message: "تغيّر هذا التعيين منذ فتحته. أعد تحميل الصفحة ثم حاول مجددًا." };
    if (error.code === "P0002") return { status: 404, message: "لم يعد هذا التعيين موجودًا. أعد تحميل الصفحة." };
    if (error.code === "22023") {
      const match = validationMessages.find(([pattern]) => pattern.test(error.message));
      return { status: 400, message: match?.[1] ?? "بيانات التعيين غير صالحة. راجع الحقول." };
    }
  }
  logEvent("error", "oversight.contract_failed", {
    contract, code: error instanceof QararApiError ? error.code : undefined, cause: error instanceof Error ? error.name : "unknown",
  });
  return { status: 500, message: "تعذر تنفيذ العملية. حاول مجددًا." };
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;

  const { contract, params } = parsed.value;
  if (typeof contract !== "string" || !contracts.has(contract)) {
    return NextResponse.json({ error: { message: "عملية غير مدعومة." } }, { status: 400 });
  }
  if (params !== undefined && !isJsonObject(params)) {
    return NextResponse.json({ error: { message: "معاملات العملية غير صالحة." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await qararRpcV2<unknown>(contract, params ?? {}) });
  } catch (error) {
    const safe = failure(error, contract);
    return NextResponse.json({ error: { message: safe.message } }, { status: safe.status });
  }
}
