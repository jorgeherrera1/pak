import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@dark-factory/annotate",
    "@dark-factory/contracts",
    "@dark-factory/knowledge-graph",
    "@dark-factory/parse",
    "@dark-factory/resolve",
    "@dark-factory/ui",
  ],
};

export default withWorkflow(nextConfig);
