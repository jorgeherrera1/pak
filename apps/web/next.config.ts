import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dark-factory/ui"],
  // Loaded from its built dist so its prompt files resolve next to the code.
  serverExternalPackages: ["@dark-factory/annotate"],
};

export default withWorkflow(nextConfig);
