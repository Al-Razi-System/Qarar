type ErrorWithMetadata = {
  status?: unknown;
  code?: unknown;
};

const PUBLIC_ERROR_CODES = new Set([
  "22023",
  "23505",
  "23514",
  "23P01",
  "40001",
  "P0002",
  "P0003",
]);

export type SafeAdminError = {
  code: string;
  message: string;
  status: number;
};

function isRecord(value: unknown): value is ErrorWithMetadata {
  return typeof value === "object" && value !== null;
}

/**
 * Maps database/Edge failures to a display-safe result. Raw upstream text,
 * hints and details can contain schema names or policy implementation data and
 * must remain in server logs rather than a browser response.
 */
export function safeAdminError(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 400,
): SafeAdminError {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return {
      code: "UNAUTHENTICATED",
      message: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
      status: 401,
    };
  }

  const metadata = isRecord(error) ? error : undefined;
  const upstreamStatus = metadata?.status;
  const status =
    typeof upstreamStatus === "number" &&
    Number.isInteger(upstreamStatus) &&
    upstreamStatus >= 400 &&
    upstreamStatus <= 599
      ? upstreamStatus
      : fallbackStatus;
  const upstreamCode = metadata?.code;
  const code =
    typeof upstreamCode === "string" && PUBLIC_ERROR_CODES.has(upstreamCode)
      ? upstreamCode
      : "ADMIN_OPERATION_FAILED";

  return { code, message: fallbackMessage, status };
}
