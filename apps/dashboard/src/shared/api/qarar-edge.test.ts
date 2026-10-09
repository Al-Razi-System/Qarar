import { expect, it } from "vitest";
import { readEdgeResponse } from "./edge-response";
it.each([403, 409, 503])("retains HTTP %i and trace without reflecting protected provider diagnostics", async status => {
  await expect(readEdgeResponse(new Response(JSON.stringify({ error: "operation_failed", traceId: "trace-id" }), { status }))).rejects.toMatchObject({ status, traceId: "trace-id", message: `QARAR_EDGE_${status}` });
});
it("keeps the successful edge receipt intact", async () => {
  expect(await readEdgeResponse(new Response(JSON.stringify({ account_created: true, user_id: "id" }), { status: 201 }))).toEqual({ account_created: true, user_id: "id" });
});
