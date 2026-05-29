import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multipart uploads include boundaries; default 10MB proxy buffer truncates FormData.
  experimental: {
    proxyClientMaxBodySize: "15mb",
  },
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "sharp"],
};

export default nextConfig;
