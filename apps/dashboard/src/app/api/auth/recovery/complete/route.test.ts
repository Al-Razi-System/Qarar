import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function request(body: Record<string, unknown>) {
  return new Request("https://admin.example.gov/api/auth/recovery/complete", { method: "POST", headers: { Origin: "https://admin.example.gov", "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
describe("password recovery completion", () => {
  it("changes the password then globally revokes refresh sessions", async () => {
    vi.stubEnv("APP_ORIGIN", "https://admin.example.gov"); vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000"); vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "anon");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    const access = `x.${Buffer.from(JSON.stringify({ amr: [{ method: "recovery" }] })).toString("base64url")}.x`;
    const response = await POST(request({ access_token: access, refresh_token: "refresh", password: "StrongPassword1!" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("http://kong:8000/auth/v1/user", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenCalledWith("http://kong:8000/auth/v1/logout?scope=global", expect.objectContaining({ method: "POST" }));
  });
  it("rejects an expired recovery access token without changing a password", async () => {
    vi.stubEnv("APP_ORIGIN", "https://admin.example.gov"); vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000"); vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "anon");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 })); vi.stubGlobal("fetch", fetchMock);
    const expired = `x.${Buffer.from(JSON.stringify({ amr: [{ method: "recovery" }] })).toString("base64url")}.x`;
    const response = await POST(request({ access_token: expired, refresh_token: "refresh", password: "StrongPassword1!" }));
    expect(response.status).toBe(410); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects a normal authenticated token even when it is otherwise valid", async () => {
    vi.stubEnv("APP_ORIGIN", "https://admin.example.gov"); vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000"); vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "anon");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const normal = `x.${Buffer.from(JSON.stringify({ amr: [{ method: "password" }] })).toString("base64url")}.x`;
    const response = await POST(request({ access_token: normal, refresh_token: "refresh", password: "StrongPassword1!" }));
    expect(response.status).toBe(410); expect(fetchMock).not.toHaveBeenCalled();
  });
});
