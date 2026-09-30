import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Bottom-left so the dev indicator never sits on the corner hub (Sept 20, 2026).
  devIndicators: { position: "bottom-left" },
  // PDF routes load font files from disk at render time; make sure they ship in the serverless bundle.
  outputFileTracingIncludes: { "/clients/[id]/notes.pdf": ["./src/fonts/**/*"], "/reports/payroll.pdf": ["./src/fonts/**/*"], "/reports/visits.pdf": ["./src/fonts/**/*"], "/visits/[id]/note.pdf": ["./src/fonts/**/*"] },
  // Defence in depth for a PHI app: no framing by other sites, no MIME sniffing, no plugins, forms
  // and navigations only to ourselves, workers only from our own files (pdf.js), no referrers leaking
  // record URLs. Next's own inline scripts need 'unsafe-inline'; development needs 'unsafe-eval' for HMR.
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-src 'self' blob:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
  async rewrites() {
    // Wherever a login is required, a visitor with no session cookie gets the product website at "/"
    // instead of being bounced to /login. Signed-in staff still land on the app's home. Open-access
    // development keeps "/" as the app, since everyone there is signed in as the first admin.
    const loginRequired = process.env.NODE_ENV === "production" || process.env.REQUIRE_LOGIN === "1";
    return {
      beforeFiles: loginRequired
        ? [{ source: "/", missing: [{ type: "cookie" as const, key: "ehr_session" }], destination: "/site/index.html" }]
        : [],
      afterFiles: [
        { source: "/notes", destination: "/visits" },
        { source: "/notes/:path*", destination: "/visits/:path*" },
        // Marketing pages: each nav tab is its own static page under public/site/.
        { source: "/clinical", destination: "/site/clinical.html" },
        { source: "/practice", destination: "/site/practice.html" },
        { source: "/pricing", destination: "/site/pricing.html" },
        { source: "/questions", destination: "/site/questions.html" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
