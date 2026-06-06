import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["app.ecommerce.local"],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
