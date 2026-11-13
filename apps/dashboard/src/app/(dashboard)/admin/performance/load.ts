import { QararApiError, qararRpcV2 } from "@/shared/api/qarar-server";
import { logEvent } from "@/shared/observability/logger";

export type Loaded<T> = { data: T } | { failure: "denied" | "missing" | "error" };

/** Only a real calendar day reaches the contract; anything else falls back to the current academic year. */
export const academicYearParam = (value: string | string[] | undefined) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function loadPerformance<T>(contract: string, body: Record<string, unknown>): Promise<Loaded<T>> {
  try {
    return { data: await qararRpcV2<T>(contract, body) };
  } catch (error) {
    const code = error instanceof QararApiError ? error.code : undefined;
    if (code === "42501") return { failure: "denied" };
    if (code === "P0002" || code === "22P02") return { failure: "missing" };
    logEvent("error", "performance.load_failed", { contract, cause: error instanceof Error ? error.message : "unknown" });
    return { failure: "error" };
  }
}
