import type { NextConfig } from "next";
import { getSupabasePublicConfig } from "./lib/supabase-config";

if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) getSupabasePublicConfig();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};

export default nextConfig;
