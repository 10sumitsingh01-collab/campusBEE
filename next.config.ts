import type { NextConfig } from "next";

if (process.env.VERCEL_ENV === 'production') {
  const configured = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'false'
    && process.env.NEXT_PUBLIC_SUPABASE_URL
    && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    && process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configured) throw new Error('Configure production Supabase mode, URL, public key, and server-only service key before deploying CampusBEE.');
}

const nextConfig: NextConfig = {
  async rewrites() {
    return { beforeFiles: [{
      source: '/api/:path((?!public/|health$).*)',
      has: [{ type: 'cookie', key: 'campusbee_demo', value: '1' }],
      destination: '/hosted-demo/:path',
    }], afterFiles: [], fallback: [] };
  },
  outputFileTracingExcludes: { "/*": [".campus-data/**"] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
