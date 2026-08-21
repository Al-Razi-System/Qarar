import { describe, expect, it } from "vitest";

import {
  constantTimeTokenEquals,
  getDashboardOrigin,
  rejectUntrustedMutation,
} from "./request-guards";

const production = { NODE_ENV: "production", APP_ORIGIN: "https://admin.example.gov" };

describe("request guards", () => {
  it("لا يستخدم Host ويقبل فقط APP_ORIGIN المهيأ", () => {
    expect(getDashboardOrigin(production)).toBe("https://admin.example.gov");
    expect(getDashboardOrigin({ APP_ORIGIN: "https://admin.example.gov/admin" })).toBeNull();
    expect(getDashboardOrigin({ APP_ORIGIN: "https://user:password@admin.example.gov" })).toBeNull();
    expect(getDashboardOrigin({ NODE_ENV: "production", APP_ORIGIN: "http://admin.example.gov" })).toBeNull();
    expect(getDashboardOrigin({ NODE_ENV: "production", APP_ORIGIN: "https://admin.example.gov/" })).toBeNull();
  });

  it("يفشل مغلقًا لمسار cookie mutation عندما تغيب APP_ORIGIN في الإنتاج", async () => {
    const result = rejectUntrustedMutation(
      new Request("https://admin.example.gov/api/admin/users", { method: "POST" }),
      { NODE_ENV: "production" },
    );

    expect(result?.status).toBe(503);
    expect(result?.headers.get("Vary")).toBe("Origin");
  });

  it("يرفض Origin المفقود أو غير الموثوق ويقبل المصدر المطابق", () => {
    const missing = rejectUntrustedMutation(
      new Request("https://admin.example.gov/api/admin/users", { method: "POST" }),
      production,
    );
    const foreign = rejectUntrustedMutation(
      new Request("https://admin.example.gov/api/admin/users", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      }),
      production,
    );
    const trusted = rejectUntrustedMutation(
      new Request("https://admin.example.gov/api/admin/users", {
        method: "POST",
        headers: { Origin: "https://admin.example.gov" },
      }),
      production,
    );

    expect(missing?.status).toBe(403);
    expect(foreign?.status).toBe(403);
    expect(trusted).toBeNull();
  });

  it("يقارن الأسرار دون قبول القيم المفقودة أو المختلفة", () => {
    expect(constantTimeTokenEquals("same", "same")).toBe(true);
    expect(constantTimeTokenEquals("same", "different")).toBe(false);
    expect(constantTimeTokenEquals(null, "same")).toBe(false);
    expect(constantTimeTokenEquals("same", undefined)).toBe(false);
  });
});
