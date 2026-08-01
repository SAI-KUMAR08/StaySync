import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = (env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:5000").replace(/\/+$/, "");

  // Optional bundle analysis (L-15). Run `npm run analyze` to emit
  // bundle-visualizer.html. Gracefully skipped if the package isn't installed.
  let visualizer = null;
  try {
    ({ visualizer } = await import("rollup-plugin-visualizer"));
  } catch {
    /* optional dev dependency — build works without it */
  }

  const plugins = [react(), tailwindcss()];
  if (env.ANALYZE === "true" && visualizer) {
    plugins.push(visualizer({ filename: "bundle-visualizer.html", gzipSize: true }));
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-router": ["react-router-dom", "react-router"],
            "vendor-axios": ["axios"],
          },
        },
      },
    },
    server: {
      port: 5173,
      // Dev: browser calls same origin (/api, /socket.io) — Vite proxies to local or Render API (no CORS).
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },
  };
});
