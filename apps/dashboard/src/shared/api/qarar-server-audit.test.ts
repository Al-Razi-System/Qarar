import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const token = `header.${Buffer.from(JSON.stringify({ aal: "aal2", sub: "a1b2c3d4-0000-4000-8000-000000000001" })).toString("base64url")}.signature`;
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: token }) })),
  headers: vi.fn(async () => new Headers({
    "x-qarar-client-ip": "203.0.113.30",
    "user-agent": "Mozilla/5.0 Chrome/130",
    "x-request-id": "edge-req-42",
  })),
}));

import { QararApiError, qararEdge, qararRpc, qararRpcV2 } from "./qarar-server";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubFetch(main: () => Response, outcome: () => Response = () => Response.json("ok")) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return url.endsWith("/service_record_api_outcome_v2") ? outcome() : main();
  }));
  return calls;
}

beforeEach(() => {
  vi.stubEnv("QARAR_SUPABASE_URL", "http://localhost:55421");
  vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("QARAR_SUPABASE_SERVICE_ROLE_KEY", "service");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("qarar-server audit context", () => {
  it("forwards the request id, the trusted client IP and the device to the database", async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    await qararRpc("read_something", {});
    expect(calls[0].headers).toMatchObject({
      "X-Qarar-Request-Id": "edge-req-42",
      "X-Qarar-Client-IP": "203.0.113.30",
      "X-Qarar-User-Agent": "Mozilla/5.0 Chrome/130",
    });
  });

  it("forwards the same context to Edge Functions, which pass it on to the database", async () => {
    const calls = stubFetch(() => Response.json({ revoked: true }));
    await qararEdge("iam-admin", { action: "revoke_session" });
    expect(calls[0].url).toBe("http://localhost:55421/functions/v1/iam-admin");
    expect(calls[0].headers).toMatchObject({ "X-Qarar-Request-Id": "edge-req-42", "X-Qarar-Client-IP": "203.0.113.30" });
  });

  it("records a denied attempt with who tried which contract, then reports the original error", async () => {
    const calls = stubFetch(() => Response.json({ code: "42501", message: "permission denied: x" }, { status: 403 }));
    await expect(qararRpc("admin_list_sessions", { p_status: "all" })).rejects.toMatchObject({ status: 403, code: "42501" });
    const outcome = calls.find((call) => call.url.endsWith("/service_record_api_outcome_v2"));
    expect(outcome?.headers).toMatchObject({ Authorization: "Bearer service", "Content-Profile": "api_v2", "X-Qarar-Request-Id": "edge-req-42" });
    expect(outcome?.body).toEqual({
      p_actor_user_id: "a1b2c3d4-0000-4000-8000-000000000001", p_api_version: "v1", p_contract: "admin_list_sessions",
      p_result: "denied", p_error_code: "42501", p_http_status: 403,
    });
  });

  it("records a server failure and a missing contract as failures", async () => {
    let calls = stubFetch(() => Response.json({ code: "XX000" }, { status: 500 }));
    await expect(qararRpcV2("cast_vote_v2", {})).rejects.toBeInstanceOf(QararApiError);
    expect(calls.at(-1)?.body).toMatchObject({ p_api_version: "v2", p_contract: "cast_vote_v2", p_result: "failure", p_http_status: 500 });

    calls = stubFetch(() => Response.json({ code: "PGRST202" }, { status: 404 }));
    await expect(qararRpc("admin_search_audit_logs", {})).rejects.toBeInstanceOf(QararApiError);
    expect(calls.at(-1)?.body).toMatchObject({ p_result: "failure", p_error_code: "PGRST202", p_http_status: 404 });
  });

  it("does not record ordinary business rejections", async () => {
    const calls = stubFetch(() => Response.json({ code: "P0001", message: "agenda locked" }, { status: 400 }));
    await expect(qararRpc("update_agenda", {})).rejects.toBeInstanceOf(QararApiError);
    expect(calls.some((call) => call.url.endsWith("/service_record_api_outcome_v2"))).toBe(false);
  });

  it("keeps the user's error when recording the outcome itself fails", async () => {
    stubFetch(() => Response.json({ code: "42501" }, { status: 403 }), () => { throw new Error("network down"); });
    await expect(qararRpc("admin_list_sessions", {})).rejects.toMatchObject({ status: 403 });
  });
});
