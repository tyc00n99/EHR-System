import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: { position: "bottom-right" },
  // PDF routes load font files from disk at render time; make sure they ship in the serverless bundle.
  outputFileTracingIncludes: { "/clients/[id]/notes.pdf": ["./src/fonts/**/*"], "/reports/payroll.pdf": ["./src/fonts/**/*"] },
  async rewrites() {
    return [{ source: "/notes", destination: "/visits" }, { source: "/notes/:path*", destination: "/visits/:path*" }];
  },
};

export default nextConfig;
