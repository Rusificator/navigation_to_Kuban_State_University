import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "demo" ? [viteSingleFile()] : [])],
  build: {
    target: ["chrome93", "safari16"],
    outDir: mode === "demo" ? "demo" : "dist",
    chunkSizeWarningLimit: 1600,
  },
}));
