import { describe, expect, it } from "vitest";

import { safeAdminError } from "./admin-error";

describe("safeAdminError", () => {
  it("preserves an authored Arabic HTTP conflict without reflecting SQL", () => {
    expect(safeAdminError(Object.assign(new Error("تغيرت صورتك؛ أعد تحميلها"), { code: "PT409", status: 409 }), "تعذر الحفظ")).toMatchObject({ status: 409, message: "تغيرت صورتك؛ أعد تحميلها" });
    expect(safeAdminError(Object.assign(new Error("private SQL details"), { code: "PT409", status: 409 }), "تعذر الحفظ")).toMatchObject({ status: 409, message: "تعذر الحفظ" });
  });
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

  it("يصنف مهلة قاعدة البيانات برسالة عامة آمنة قابلة للتخصيص عند المسار", () => {
    expect(safeAdminError(
      { status: 500, code: "57014", message: "canceling statement due to statement timeout" },
      "تعذر تنفيذ العملية.",
    )).toEqual({
      code: "QUERY_TIMEOUT",
      message: "استغرق تنفيذ الطلب وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات.",
      status: 503,
    });
  });
  it("translates a known English database rule into its Arabic meaning instead of the generic message", () => {
    const equalTimes = Object.assign(new Error("end_time must be after start_time"), { code: "P0001", status: 400 });
    expect(safeAdminError(equalTimes, "تعذر تنفيذ العملية.")).toEqual({ code: "22023", message: "يجب أن يكون وقت النهاية بعد وقت البداية.", status: 400 });
    const locked = Object.assign(new Error("meeting details are locked in status in_progress"), { code: "P0001", status: 400 });
    expect(safeAdminError(locked, "تعذر تنفيذ العملية.").message).toBe("لا يمكن تعديل بيانات الاجتماع بعد بدء الجلسة.");
    const stale = Object.assign(new Error("meeting was modified; refresh before update"), { code: "40001", status: 409 });
    expect(safeAdminError(stale, "تعذر تنفيذ العملية.")).toMatchObject({ code: "40001", status: 409, message: "عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة." });
  });
  it("still hides an unknown English database message", () => {
    expect(safeAdminError(Object.assign(new Error("relation qarar_meetings.x does not exist"), { code: "42P01" }), "تعذر تنفيذ العملية.").message).toBe("تعذر تنفيذ العملية.");
  });
});

