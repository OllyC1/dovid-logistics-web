import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: { root: process.cwd() },
  experimental: { optimizePackageImports: ["lucide-react", "motion"] },
  redirects: async () => [{
    source: "/track/result",
    has: [{ type: "query", key: "reference", value: "(?<reference>.+)" }],
    destination: "/track/:reference",
    permanent: false,
  }],
  headers: async () => [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "X-Frame-Options", value: "DENY" }
    ]
  }]
};

export default nextConfig;
