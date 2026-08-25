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

  it("يعامل localhost وعنوان loopback كأصل واحد في التطوير فقط", () => {
    const request = new Request("http://127.0.0.1:3100/api/auth/mfa", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:3100" },
    });

    expect(
      rejectUntrustedMutation(request, {
        NODE_ENV: "development",
        APP_ORIGIN: "http://localhost:3100",
      }),
    ).toBeNull();
    expect(
      rejectUntrustedMutation(request, {
        NODE_ENV: "production",
        APP_ORIGIN: "https://localhost:3100",
      })?.status,
    ).toBe(403);
  });

  it("يقبل أصول التطوير البديلة المهيأة صراحة ويرفض غيرها", () => {
    const environment = {
      NODE_ENV: "development",
      APP_ORIGIN: "http://192.168.0.103:3300",
      APP_ORIGIN_ALIASES: "http://localhost:3300,http://127.0.0.1:3300",
    };
    const localRequest = new Request("http://localhost:3300/api/admin/meetings", {
      method: "POST",
      headers: { Origin: "http://localhost:3300" },
    });
    const foreignRequest = new Request("http://192.168.0.103:3300/api/admin/meetings", {
      method: "POST",
      headers: { Origin: "http://192.168.0.44:3300" },
    });

    expect(rejectUntrustedMutation(localRequest, environment)).toBeNull();
    expect(rejectUntrustedMutation(foreignRequest, environment)?.status).toBe(403);
  });

  it("يقارن الأسرار دون قبول القيم المفقودة أو المختلفة", () => {
    expect(constantTimeTokenEquals("same", "same")).toBe(true);
    expect(constantTimeTokenEquals("same", "different")).toBe(false);
    expect(constantTimeTokenEquals(null, "same")).toBe(false);
    expect(constantTimeTokenEquals("same", undefined)).toBe(false);
  });
});
