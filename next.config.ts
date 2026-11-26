import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
