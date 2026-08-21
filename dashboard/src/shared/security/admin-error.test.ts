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
