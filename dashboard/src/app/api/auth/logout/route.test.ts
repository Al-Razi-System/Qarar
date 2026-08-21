import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieGet, cookieSet, cookies, getQararEnv } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  getQararEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/shared/api/qarar-server", () => ({ getQararEnv }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/auth/logout", () => {
  it("يلغي الجلسة عند GoTrue قبل محو كوكيز المتصفح", async () => {
    cookieGet.mockReturnValue({ value: "access-token" });
    cookies.mockResolvedValue({ get: cookieGet, set: cookieSet });
    getQararEnv.mockResolvedValue({
      SUPABASE_URL: "http://kong:8000",
      ANON_KEY: "anon-key",
      SERVICE_ROLE_KEY: "",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://kong:8000/auth/v1/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token", apikey: "anon-key" }),
      }),
    );
    expect(cookieSet).toHaveBeenCalledTimes(2);
  });

  it("يمحو الكوكيز حتى إن كانت خدمة الإلغاء غير متاحة", async () => {
    cookieGet.mockReturnValue({ value: "access-token" });
    cookies.mockResolvedValue({ get: cookieGet, set: cookieSet });
    getQararEnv.mockRejectedValue(new Error("offline"));

    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(cookieSet).toHaveBeenCalledTimes(2);
  });
});
