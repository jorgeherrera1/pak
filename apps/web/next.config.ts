import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dark-factory/ui"],
};

export default withWorkflow(nextConfig);
