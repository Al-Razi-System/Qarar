type E2ETargetEnvironment = Record<string, string | undefined>;

export type E2EDatabaseTarget = {
  container: string;
  database: string;
};

const allowedLocalHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertIsolatedE2ETarget(env: E2ETargetEnvironment): E2EDatabaseTarget {
  if (env.QARAR_E2E_ALLOW_DATABASE_MUTATION !== "isolated-local-only") {
    throw new Error("أوقِف اختبار E2E: لم يُمنح تصريح الكتابة على قاعدة اختبار معزولة.");
  }

  let hostname = "";
  try {
    hostname = new URL(env.SUPABASE_PUBLIC_URL ?? "").hostname;
  } catch {
    throw new Error("أوقِف اختبار E2E: عنوان Supabase غير صالح.");
  }
  if (!allowedLocalHosts.has(hostname)) {
    throw new Error("أوقِف اختبار E2E: لا يجوز تشغيل الاختبارات المتلفة على خدمة غير محلية.");
  }

  const container = env.QARAR_E2E_DATABASE_CONTAINER ?? "";
  if (!/^qarar-e2e-[a-z0-9-]+$/.test(container)) {
    throw new Error("أوقِف اختبار E2E: يجب استخدام حاوية مخصصة يبدأ اسمها بـ qarar-e2e-.");
  }

  const database = env.QARAR_E2E_DATABASE_NAME ?? "";
  if (!/^[a-z0-9_]+_e2e$/.test(database)) {
    throw new Error("أوقِف اختبار E2E: يجب استخدام قاعدة مخصصة ينتهي اسمها بـ _e2e.");
  }

  return { container, database };
}
