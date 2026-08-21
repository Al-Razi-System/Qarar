type QararRuntimeEnvironment = Record<string, string | undefined>;

export type QararSupabaseRuntimeConfig = {
  apiUrl: string;
  anonKey: string;
};

/**
 * Reads the public Supabase connection details that are injected into the
 * dashboard container at runtime. This intentionally has no filesystem
 * fallback: deployment images do not contain Supabase's local Docker env file.
 */
export function getQararSupabaseRuntimeConfig(
  environment: QararRuntimeEnvironment = process.env,
): QararSupabaseRuntimeConfig | null {
  const rawUrl = environment.QARAR_SUPABASE_URL?.trim();
  const anonKey = environment.QARAR_SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !anonKey) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    return {
      apiUrl: url.toString().replace(/\/+$/, ""),
      anonKey,
    };
  } catch {
    return null;
  }
}
