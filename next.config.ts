import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Node-only libraries that are loaded with plain `require` on the server
  // instead of being bundled (MJML in particular loads parts of itself dynamically).
  serverExternalPackages: ["mjml", "nodemailer", "liquidjs", "sanitize-html"],
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
