import type { NextConfig } from "next";

// `scripts/build.mjs` creates this once before Next starts. Generating it here
// with Date.now() produced different values when Next evaluated the config in
// separate server and browser build workers, so every page looked outdated.
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep production builds within the memory available to Docker Desktop on
  // development machines. Next otherwise uses every reported CPU and can run
  // enough page workers to make BuildKit's Linux VM run out of memory.
  experimental: {
    cpus: 1,
    // Proxy clones request bodies; preserve the bounded 16 MB restore upload
    // plus multipart fields. Other routes retain the existing 6 MB guard.
    proxyClientMaxBodySize: 16 * 1024 * 1024 + 16 * 1024,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  // `X-Powered-By: Next.js` is sent on every single response: a few wasted bytes
  // per response and a free framework-version fingerprint for anyone scanning
  // for known framework CVEs.
  poweredByHeader: false,
  // Gzip is done by Caddy (`encode zstd gzip`), not by Node. Next's built-in
  // compression runs on the same single-threaded event loop that serves every
  // request, so every JSON response was paying deflate CPU in front of the
  // handler queue. Caddy compresses in Go on its own threads and can serve zstd,
  // which is both faster and smaller than gzip for mobile clients.
  //
  // Caddy must be reloaded together with this change: with `compress: false` and
  // no `encode` directive, responses would go out uncompressed.
  compress: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
