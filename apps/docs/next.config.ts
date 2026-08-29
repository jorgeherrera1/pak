import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dark-factory/ui"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
