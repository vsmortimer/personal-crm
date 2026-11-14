import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// 'unsafe-inline' for scripts and styles on purpose: Next.js puts inline
// scripts (page data) and styles into every page. A nonce would make every
// page render again on each request, which breaks cacheComponents and partial
// prefetching. 'unsafe-eval' only for `next dev`: React needs it there.
// Everything else (fonts included, see next/font) comes from our own domain.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Sent with every response, static files and /health included. nginx adds
// nothing, so these are the only ones. HSTS: a year, without includeSubDomains
// and preload: the server is shared with the landing.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // The old way of forbidding frames, for browsers without frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  // The Docker image (see Dockerfile) runs the minimal standalone server;
  // locally `pnpm start` keeps using next start
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // No `x-powered-by: Next.js`: the app does not name its software
  poweredByHeader: false,
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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
