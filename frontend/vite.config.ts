import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEV_SERVER_PORT = 5173;

/** Tight CSP without `unsafe-eval`. Dev adds `unsafe-inline` — Vite HMR injects small inline scripts. */
function contentSecurityPolicyMeta(isServe: boolean): string {
  if (isServe) {
    const origin = `http://127.0.0.1:${DEV_SERVER_PORT} http://localhost:${DEV_SERVER_PORT}`;
    const ws = `ws://127.0.0.1:${DEV_SERVER_PORT} ws://localhost:${DEV_SERVER_PORT}`;
    return [
      "default-src 'self'",
      "base-uri 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${origin} ${ws}`,
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
    ].join("; ");
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join("; ");
}

function htmlCspPlugin(isServe: boolean): Plugin {
  return {
    name: "html-content-security-policy",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            injectTo: "head-prepend",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: contentSecurityPolicyMeta(isServe),
            },
          },
        ],
      };
    },
  };
}

export default defineConfig(({ command }) => {
  return {
    /** Electron `loadFile` → `file://`: absolute `/assets/...` würde nicht laden → weißes Fenster */
    base: "./",
    plugins: [htmlCspPlugin(command === "serve"), react()],
    server: {
      port: DEV_SERVER_PORT,
    },
  };
});
