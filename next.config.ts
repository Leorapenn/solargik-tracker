import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Contract PDFs are uploaded to a Server Action for reading; Vercel itself caps requests at ~4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
