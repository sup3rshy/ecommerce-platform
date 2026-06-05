import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin root vào thư mục app để Next không inferred lên monorepo root
    // (root đã có package-lock.json từ concurrently runner).
    root: import.meta.dirname,
  },
};

export default nextConfig;
