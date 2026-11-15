import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (ignored by Vercel).
  output: "standalone",
  images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }] },
};

export default nextConfig;
