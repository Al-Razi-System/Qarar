type UploadEnvelope<T> = {
  data?: T;
  error?: { message?: string };
};

const uploadStatusMessages: Record<number, string> = {
  401: "انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.",
  413: "حجم الملف يتجاوز الحد المسموح وهو 25 ميجابايت.",
  415: "صيغة الملف غير مدعومة. استخدم PDF أو PNG أو JPEG أو DOCX.",
  422: "رُفض الملف أثناء فحص الأمان.",
  503: "خدمة فحص الملفات غير متاحة حالياً. حاول مجدداً لاحقاً.",
};

export async function readUploadResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as UploadEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message
        ?? uploadStatusMessages[response.status]
        ?? "تعذر رفع الملف. حاول مجدداً.",
    );
  }

  if (!payload || payload.data === undefined) {
    throw new Error("اكتمل طلب الرفع لكن الخادم أعاد استجابة غير صالحة.");
  }

  return payload.data;
}
