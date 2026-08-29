import { NextResponse } from "next/server";
import { QararApiError, qararRpc, requireQararSession } from "@/shared/api/qarar-server";
import { apiError, apiSuccess, requestId } from "@/shared/api/response";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const contracts = new Set([
  "admin_search_policies",
  "admin_get_policy_detail",
  "admin_create_policy",
  "admin_create_policy_idempotent",
  "admin_update_policy",
  "admin_create_policy_version",
  "admin_remove_empty_policy_version",
  "admin_add_policy_item",
  "admin_update_policy_item",
  "admin_move_policy_item",
  "admin_remove_policy_item",
  "admin_set_policy_scope",
  "admin_remove_policy_scope",
  "admin_set_policy_item_scope_override",
  "admin_submit_policy_for_review",
  "admin_approve_policy_version",
  "admin_activate_policy_version",
  "admin_suspend_policy_version",
  "admin_list_workflow_templates",
  "admin_create_workflow_template",
  "admin_create_workflow_version",
  "admin_add_workflow_step",
  "admin_update_workflow_step",
  "admin_remove_workflow_step",
  "admin_add_workflow_transition",
  "admin_activate_workflow_template_version",
  "admin_list_governance_unit_classes",
  "admin_list_governance_units",
  "admin_list_governance_unit_types",
  "admin_list_topic_categories",
  "admin_create_governance_unit",
  "admin_update_governance_unit",
  "admin_create_governance_unit_class",
  "admin_update_governance_unit_class",
  "admin_assign_governance_unit_class",
  "admin_create_topic_category",
  "admin_update_topic_category",
  "get_topic_regulation_options",
  "create_topic_with_selected_regulation",
  "get_topic_governance_summary",
  "act_topic_workflow_step",
  "admin_list_governance_exceptions",
  "request_workflow_exception",
  "approve_workflow_exception",
  "request_custom_workflow",
  "approve_custom_workflow",
  "create_topic_exception_request",
  "admin_import_policy_bundle",
  "admin_add_policy_attachment",
  "admin_remove_policy_attachment",
  "preview_policy_conditions",
  "get_policy_form_options",
  "admin_update_policy_version_legal_metadata",
  "admin_update_policy_item_legal_text",
  "admin_save_policy_rule",
  "admin_remove_policy_rule",
  "admin_save_policy_reference",
  "admin_remove_policy_reference",
  "admin_get_policy_legislative_model",
  "admin_validate_policy_version_readiness",
  "admin_compare_policy_versions",
]);

function errorMessage(code?: string, fallback?: string, hint?: string) {
  const raw = `${fallback ?? ""} ${hint ?? ""}`.toLowerCase();

  if (code === "42501") {
    return "ليست لديك الصلاحية الكافية لتنفيذ هذه العملية أو أن العملية تتطلب مراجعًا مستقلًا.";
  }
  if (code === "23505") {
    return "توجد بيانات بنفس الرمز أو القيمة. استخدم رمزًا مختلفًا أو حدّث السجل الحالي.";
  }
  if (code === "23514" && raw.includes("policy_scope_assignments_check3")) {
    return "\u062e\u064a\u0627\u0631 \u062a\u0636\u0645\u064a\u0646 \u0627\u0644\u062c\u0647\u0627\u062a \u0627\u0644\u062a\u0627\u0628\u0639\u0629 \u0645\u062a\u0627\u062d \u0641\u0642\u0637 \u0639\u0646\u062f \u0627\u062e\u062a\u064a\u0627\u0631 \u0646\u0637\u0627\u0642 \u00ab\u0648\u062d\u062f\u0629 \u0648\u0627\u0644\u062c\u0647\u0627\u062a \u0627\u0644\u062a\u0627\u0628\u0639\u0629\u00bb.";
  }
  if (code === "23514" && raw.includes("policy_scope_assignments_check2")) {
    return "\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u064a\u062d\u062a\u0627\u062c \u0625\u0644\u0649 \u062c\u0647\u0629 \u0623\u0648 \u062a\u0635\u0646\u064a\u0641 \u0623\u0648 \u0645\u0633\u062a\u0648\u0649 \u062a\u0646\u0638\u064a\u0645\u064a \u0635\u062d\u064a\u062d.";
  }
  if (code === "40001") {
    return "حدث تعارض تزامن: تم تعديل البيانات من مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (
    code === "22023" &&
    (raw.includes("outcome") || raw.includes("النتيجة"))
  ) {
    return "النتيجة المختارة غير مسموحة لهذه الخطوة. اختر نتيجة من النتائج المعتمدة في المسار.";
  }
  if (
    raw.includes("selected regulation") ||
    raw.includes("no longer eligible")
  ) {
    return "اختيار اللائحة لم يعد صالحًا لهذا الموضوع. أعد اختبار المطابقة واختر لائحة متاحة.";
  }
  if (
    (raw.includes("workflow") || raw.includes("المسار")) &&
    (raw.includes("missing") ||
      raw.includes("valid") ||
      raw.includes("configured") ||
      raw.includes("مكتمل") ||
      raw.includes("مفعل") ||
      raw.includes("مفعّل"))
  ) {
    return "المسار غير مكتمل أو غير مفعّل. أكمل خطوات المسار والانتقالات ثم فعّله قبل استخدامه.";
  }

  const messages: Record<string, string> = {
    P0002: "السجل المطلوب غير موجود أو لا ينتمي إلى منظمتك.",
    "22023": "توجد قيمة غير صالحة. راجع الحقول المطلوبة والقيم المسموحة.",
    "23514":
      "الإعداد غير مكتمل أو لا يحقق قواعد الحوكمة. أكمل المتطلبات ثم أعد المحاولة.",
    "23P01":
      "توجد فترة سريان متداخلة مع إصدار نافذ آخر. عدّل تاريخ البداية أو النهاية.",
    "55000":
      "حالة السجل الحالية لا تسمح بتنفيذ هذه العملية. راجع مرحلة الاعتماد أو جاهزية المسار.",
  };

  return messages[code ?? ""] ?? "تعذر تنفيذ العملية.";
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const id = requestId(request);
  try {
    await requireQararSession();
    const parsedBody = await readJsonObject(request);
    if (!parsedBody.ok) return parsedBody.response;

    const { contract, params } = parsedBody.value;
    if (typeof contract !== "string" || !contracts.has(contract)) {
      return NextResponse.json(
        { error: { message: "عملية غير مدعومة." } },
        { status: 400 },
      );
    }
    if (params !== undefined && !isJsonObject(params)) {
      return NextResponse.json(
        { error: { message: "معاملات العملية غير صالحة." } },
        { status: 400 },
      );
    }
    const safeParams = params ?? {};
    if (
      contract === "admin_create_policy" ||
      contract === "admin_create_policy_idempotent"
    ) {
      const code =
        typeof safeParams.p_code === "string"
          ? safeParams.p_code.trim().toLowerCase()
          : "";
      if (!/^[a-z][a-z0-9_.-]*$/.test(code)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message:
                "رمز اللائحة يجب أن يبدأ بحرف إنجليزي صغير، ويقبل الأرقام والشرطات والنقاط فقط.",
              details: "مثال صحيح: academic-regulation-2026",
            },
          },
          { status: 400 },
        );
      }
      safeParams.p_code = code;
    }
    if (
      (contract === "admin_create_policy_idempotent" ||
        contract === "admin_import_policy_bundle") &&
      typeof safeParams.p_client_request_id !== "string"
    ) {
      return apiError(
        "IDEMPOTENCY_KEY_REQUIRED",
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        id,
      );
    }
    const data = await qararRpc<unknown>(contract, safeParams);
    return apiSuccess(data, id);
  } catch (error) {
    if (error instanceof QararApiError) {
      return apiError(
        errorMessage(error.code, error.message, error.hint),
        error.status,
        error.code ?? "API_ERROR",
        id,
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: { message: "انتهت الجلسة. سجل الدخول مرة أخرى." } },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: { message: "حدث خطأ غير متوقع أثناء تنفيذ العملية." } },
      { status: 500 },
    );
  }
}
