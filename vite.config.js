import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  rendererAliases,
  resolveTarget,
} from "./build/targets.mjs";

export default defineConfig(() => {
  const target = resolveTarget(process.env.CHATGPT_DESKTOP_TARGET);
  return {
    root: "renderer",
    plugins: [react(), tailwindcss()],
    base: "./",
    resolve: {
      alias: rendererAliases(target),
    },
    define: {
      __BUILD_TARGET__: JSON.stringify(target.id),
    },
    build: {
      outDir: "../dist-renderer",
      emptyOutDir: true,
    },
    server: { port: 5175, strictPort: true },
  };
});
