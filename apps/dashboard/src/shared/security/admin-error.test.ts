import { describe, expect, it } from "vitest";

import { safeAdminError } from "./admin-error";

describe("safeAdminError", () => {
  it("لا يعيد رسالة قاعدة البيانات الخام إلى المتصفح", () => {
    const error = safeAdminError(
      { status: 409, code: "23505", message: "duplicate key value violates unique constraint users_email_key" },
      "تعذر حفظ المستخدم.",
    );

    expect(error).toEqual({
      code: "23505",
      message: "تعذر حفظ المستخدم.",
      status: 409,
    });
  });

  it("يحافظ على استجابة الجلسة المنتهية دون كشف رسالة المصدر", () => {
    expect(safeAdminError(new Error("UNAUTHENTICATED"), "تعذر تنفيذ العملية.")).toEqual({
      code: "UNAUTHENTICATED",
      message: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
      status: 401,
    });
  });

  it("يعرض رسالة التحقق العربية الآمنة بدل إخفائها", () => {
    const source = Object.assign(new Error("لا يمكن إغلاق التصويت قبل اكتمال أصوات الأعضاء."), {
      status: 400,
      code: "23514",
    });

    expect(safeAdminError(source, "تعذر تنفيذ العملية.")).toEqual({
      code: "23514",
      message: "لا يمكن إغلاق التصويت قبل اكتمال أصوات الأعضاء.",
      status: 400,
    });
  });

  it("يترجم منع الصلاحية غير الموصوف دون كشف رسالة داخلية", () => {
    const source = Object.assign(new Error("permission denied for relation decisions"), {
      status: 403,
      code: "42501",
    });

    expect(safeAdminError(source, "تعذر تنفيذ العملية.")).toEqual({
      code: "42501",
      message: "لا تملك الصلاحية المطلوبة لتنفيذ هذه العملية.",
      status: 403,
    });
  });

  it("يستبدل أكواد المصدر غير المصرح بعرضها", () => {
    expect(
      safeAdminError({ status: 500, code: "P0001", message: "internal policy implementation" }, "تعذر تنفيذ العملية."),
    ).toEqual({
      code: "ADMIN_OPERATION_FAILED",
      message: "تعذر تنفيذ العملية.",
      status: 500,
    });
  });
});
