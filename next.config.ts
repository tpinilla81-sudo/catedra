import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Server Actions: subida de plantilla CSV/Excel hasta 5 MB (la action ya
  // filtra por tamaño; sin este límite Next rechazaba payloads > 1 MB).
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
