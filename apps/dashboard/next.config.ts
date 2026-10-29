import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const scriptSource = isProduction ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
/** The site's content security policy; only the frame-ancestors directive differs between routes. */
function contentSecurityPolicy(frameAncestors: "'none'" | "'self'") {
  return `default-src 'self'; base-uri 'self'; frame-ancestors ${frameAncestors}; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptSource}; connect-src 'self';${isProduction ? " upgrade-insecure-requests" : ""}`;
}
/**
 * The routes that serve agenda files. The live meeting room shows them inside
 * its own pages, so only these may be framed, and only by this site.
 */
export const FRAMEABLE_FILE_ROUTES = ["/api/admin/topics/upload", "/api/admin/typed-topics/files"];
const allowedDevOrigins = (process.env.QARAR_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  // Native rasterizers must stay outside the Turbopack graph. Bundling them makes
  // the first invitation preview compile extremely slowly and can select a WASM
  // fallback instead of the platform binary.
  serverExternalPackages: ["@resvg/resvg-js", "@zxing/library"],
  allowedDevOrigins,
  experimental: {
    workerThreads: true,
    turbopackPluginRuntimeStrategy: "workerThreads",
    useTypeScriptCli: false,
  },
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...(!isProduction
            ? [{ key: "Cache-Control", value: "no-store, max-age=0" }]
            : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'none'") },
          ...(isProduction
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
      // Listed after the site-wide rule: for the same header key, the last match wins.
      ...FRAMEABLE_FILE_ROUTES.map((source) => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy("'self'") },
        ],
      })),
    ];
  },
};

export default nextConfig;
