import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "tiktoken", "pdf-parse-new"],
};

export default nextConfig;
