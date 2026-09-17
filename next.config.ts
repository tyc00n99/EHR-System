import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: { position: "bottom-right" },
  // PDF routes load font files from disk at render time; make sure they ship in the serverless bundle.
  outputFileTracingIncludes: { "/clients/[id]/notes.pdf": ["./src/fonts/**/*"], "/reports/payroll.pdf": ["./src/fonts/**/*"] },
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
    return [{ source: "/notes", destination: "/visits" }, { source: "/notes/:path*", destination: "/visits/:path*" }];
  },
};

export default nextConfig;
