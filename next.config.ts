import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The Docker image (see Dockerfile) runs the minimal standalone server;
  // locally `pnpm start` keeps using next start
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
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
