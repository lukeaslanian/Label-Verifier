import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Loaded from node_modules at runtime rather than bundled, so their
  // native parts ship with the server code.
  serverExternalPackages: ["sharp", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
