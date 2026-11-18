import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Netlify exposes COMMIT_REF while building, but not to the deployed Next.js
  // server runtime. The value is a public Git identifier (never a credential)
  // and lets the temporary acceptance provisioner bind itself to one build.
  env: { DOVID_DEPLOY_COMMIT_REF: process.env.COMMIT_REF ?? "local" },
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
