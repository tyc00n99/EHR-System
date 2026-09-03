import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: { position: "bottom-right" },
  async rewrites() {
    return [{ source: "/notes", destination: "/visits" }, { source: "/notes/:path*", destination: "/visits/:path*" }];
  },
};

export default nextConfig;
