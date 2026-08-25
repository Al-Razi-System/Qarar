export type ApiErrorBody = {
  error: { code: string; message: string; requestId: string };
};

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function apiError(message: string, status: number, code = "API_ERROR", id = crypto.randomUUID()) {
  return Response.json({ error: { code, message, requestId: id } } satisfies ApiErrorBody, {
    status,
    headers: { "x-request-id": id },
  });
}

export function apiSuccess<T>(data: T, id = crypto.randomUUID()) {
  return Response.json({ data, requestId: id }, { headers: { "x-request-id": id } });
}
