import type { NextConfig } from "next";

// Static export for GitHub Pages. BASE_PATH is "/cineverse" on Pages, empty locally.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
