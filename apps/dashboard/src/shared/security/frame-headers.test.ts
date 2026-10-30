// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig, { FRAMEABLE_FILE_ROUTES, resolveNextDistDir } from "../../../next.config";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

/** The value a path receives for a header: the last matching rule wins, as in Next.js. */
function headerFor(rules: Rule[], path: string, key: string) {
  const matches = (source: string) => source === path || (source === "/:path*" && path.startsWith("/"));
  return rules.filter((rule) => matches(rule.source)).flatMap((rule) => rule.headers).filter((header) => header.key === key).at(-1)?.value;
}

describe("frame headers", () => {
  it("isolates an explicitly configured local Next output directory", () => {
    expect(resolveNextDistDir({})).toBe(".next");
    expect(resolveNextDistDir({ QARAR_NEXT_DIST_DIR: ".next-e2e" })).toBe(".next-e2e");
    expect(() => resolveNextDistDir({ QARAR_NEXT_DIST_DIR: "../shared" })).toThrow();
  });

  it("lets only the agenda file routes be framed, and only by this site", async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    expect(FRAMEABLE_FILE_ROUTES).toEqual(["/api/admin/topics/upload", "/api/admin/typed-topics/files"]);
    for (const route of FRAMEABLE_FILE_ROUTES) {
      expect(headerFor(rules, route, "X-Frame-Options")).toBe("SAMEORIGIN");
      expect(headerFor(rules, route, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
    for (const page of ["/admin/meetings/m1/live", "/api/admin/meetings", "/login"]) {
      expect(headerFor(rules, page, "X-Frame-Options")).toBe("DENY");
      expect(headerFor(rules, page, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  });

  it("keeps the rest of the policy identical on the file routes", async () => {
    const rules = (await nextConfig.headers!()) as Rule[];
    const site = headerFor(rules, "/login", "Content-Security-Policy")!;
    const file = headerFor(rules, FRAMEABLE_FILE_ROUTES[0], "Content-Security-Policy")!;
    expect(file.replace("frame-ancestors 'self'", "frame-ancestors 'none'")).toBe(site);
  });
});
