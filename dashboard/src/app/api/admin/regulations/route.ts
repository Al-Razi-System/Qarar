import { NextResponse } from "next/server";
import { QararApiError, qararRpc } from "@/shared/api/qarar-server";

const contracts = new Set([
  "admin_search_policies", "admin_get_policy_detail", "admin_create_policy",
  "admin_update_policy", "admin_create_policy_version", "admin_add_policy_item",
  "admin_update_policy_item", "admin_remove_policy_item", "admin_set_policy_scope",
  "admin_remove_policy_scope", "admin_set_policy_item_scope_override",
  "admin_submit_policy_for_review", "admin_approve_policy_version",
  "admin_activate_policy_version", "admin_suspend_policy_version",
  "admin_list_workflow_templates", "admin_create_workflow_template",
  "admin_create_workflow_version", "admin_add_workflow_step",
  "admin_update_workflow_step", "admin_remove_workflow_step",
  "admin_add_workflow_transition", "admin_activate_workflow_template_version",
  "admin_list_governance_unit_classes", "admin_list_governance_units",
  "admin_list_governance_unit_types", "admin_list_topic_categories",
  "admin_create_governance_unit", "admin_update_governance_unit",
  "admin_create_governance_unit_class", "admin_update_governance_unit_class",
  "admin_assign_governance_unit_class", "admin_create_topic_category",
  "admin_update_topic_category", "get_topic_regulation_options",
  "create_topic_with_selected_regulation", "get_topic_governance_summary",
  "act_topic_workflow_step",
  "admin_list_governance_exceptions", "request_workflow_exception",
  "approve_workflow_exception", "request_custom_workflow",
  "approve_custom_workflow", "create_topic_exception_request",
]);

function errorMessage(code?: string, fallback?: string, hint?: string) {
  const raw = `${fallback ?? ""} ${hint ?? ""}`.toLowerCase();

  if (code === "42501") {
    return "ليست لديك الصلاحية الكافية لتنفيذ هذه العملية أو أن العملية تتطلب مراجعًا مستقلًا.";
  }
  if (code === "23505") {
    return "توجد بيانات بنفس الرمز أو القيمة. استخدم رمزًا مختلفًا أو حدّث السجل الحالي.";
  }
  if (code === "40001") {
    return "حدث تعارض تزامن: تم تعديل البيانات من مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (code === "22023" && (raw.includes("outcome") || raw.includes("النتيجة"))) {
    return "النتيجة المختارة غير مسموحة لهذه الخطوة. اختر نتيجة من النتائج المعتمدة في المسار.";
  }
  if (raw.includes("selected regulation") || raw.includes("no longer eligible")) {
    return "اختيار اللائحة لم يعد صالحًا لهذا الموضوع. أعد اختبار المطابقة واختر لائحة متاحة.";
  }
  if ((raw.includes("workflow") || raw.includes("المسار")) && (raw.includes("missing") || raw.includes("valid") || raw.includes("configured") || raw.includes("مكتمل") || raw.includes("مفعل") || raw.includes("مفعّل"))) {
    return "المسار غير مكتمل أو غير مفعّل. أكمل خطوات المسار والانتقالات ثم فعّله قبل استخدامه.";
  }

  const messages: Record<string, string> = {
    P0002: "السجل المطلوب غير موجود أو لا ينتمي إلى منظمتك.",
    "22023": "توجد قيمة غير صالحة. راجع الحقول المطلوبة والقيم المسموحة.",
    "23514": "الإعداد غير مكتمل أو لا يحقق قواعد الحوكمة. أكمل المتطلبات ثم أعد المحاولة.",
    "23P01": "توجد فترة سريان متداخلة مع إصدار نافذ آخر. عدّل تاريخ البداية أو النهاية.",
    "55000": "حالة السجل الحالية لا تسمح بتنفيذ هذه العملية. راجع مرحلة الاعتماد أو جاهزية المسار.",
  };

  return messages[code ?? ""] ?? fallback ?? "تعذر تنفيذ العملية.";
}

export async function POST(request: Request) {
  try {
    const { contract, params } = await request.json() as {
      contract?: string; params?: Record<string, unknown>;
    };
    if (!contract || !contracts.has(contract)) {
      return NextResponse.json({ error: { message: "عملية غير مدعومة." } }, { status: 400 });
    }
    const safeParams = params ?? {};
    if (contract === "admin_create_policy") {
      const code = typeof safeParams.p_code === "string" ? safeParams.p_code.trim().toLowerCase() : "";
      if (!/^[a-z][a-z0-9_.-]*$/.test(code)) {
        return NextResponse.json({
          error: {
            code: "VALIDATION_ERROR",
            message: "رمز اللائحة يجب أن يبدأ بحرف إنجليزي صغير، ويقبل الأرقام والشرطات والنقاط فقط.",
            details: "مثال صحيح: academic-regulation-2026",
          },
        }, { status: 400 });
      }
      safeParams.p_code = code;
    }
    const data = await qararRpc<unknown>(contract, safeParams);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof QararApiError) {
      return NextResponse.json({
        error: {
          code: error.code,
          message: errorMessage(error.code, error.message, error.hint),
          technicalMessage: error.message,
          details: error.details,
          hint: error.hint,
        },
      }, { status: error.status });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: { message: "انتهت الجلسة. سجل الدخول مرة أخرى." } }, { status: 401 });
    }
    return NextResponse.json({ error: { message: "حدث خطأ غير متوقع أثناء تنفيذ العملية." } }, { status: 500 });
  }
}
