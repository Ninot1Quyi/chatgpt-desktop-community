import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "renderer",
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "../dist-renderer",
    emptyOutDir: true,
  },
  server: { port: 5175, strictPort: true },
});
