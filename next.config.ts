import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Node-only libraries that are loaded with plain `require` on the server
  // instead of being bundled (MJML in particular loads parts of itself dynamically).
  serverExternalPackages: ["mjml", "nodemailer", "liquidjs", "sanitize-html"],
  experimental: {
    serverActions: {
      // Templates may be up to ~1 MB of JSON (checked in queries.ts); the
      // default 1 MB request limit would reject the biggest ones.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        // Public sign-up forms (/f/<id>) are meant to be embedded in an
        // <iframe> on the user's own website, so ANY site may frame them.
        // Every other page keeps the browser default.
        source: "/f/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
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
