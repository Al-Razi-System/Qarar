/** Preserve transport status while keeping the established Error type. */
export async function readEdgeResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(typeof result.message === "string" ? result.message : `QARAR_EDGE_${response.status}`), {
      status: response.status,
      code: typeof result.code === "string" ? result.code : undefined,
      traceId: typeof result.traceId === "string" ? result.traceId : undefined,
    });
  }
  return result as T;
}
