import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multipart uploads include boundaries; must exceed PDF limit (50MB + overhead).
  experimental: {
    proxyClientMaxBodySize: "55mb",
  },
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "sharp", "@napi-rs/canvas"],
};

export default nextConfig;
