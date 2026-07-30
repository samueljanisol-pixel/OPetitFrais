import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const caisseAgentRoot = resolve(__dirname, "../caisse-agent/src");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@caisse-agent": caisseAgentRoot,
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src"),
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/index.html"),
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src"),
        buffer: "buffer/",
      },
    },
    plugins: [react()],
  },
});
