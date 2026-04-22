import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

let backendDownWarned = false;

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

export default defineConfig(({ command, mode }) => {
  /** Electron-Dev (`vite --mode electron`): kein /api-Proxy → keine Versuche gegen :8012. */
  const useSpringProxy = command === "serve" && mode !== "electron";

  return {
    /** Electron `loadFile` → `file://`: absolute `/assets/...` würde nicht laden → weißes Fenster */
    base: "./",
    plugins: [htmlCspPlugin(command === "serve"), react()],
    server: {
      port: DEV_SERVER_PORT,
      ...(useSpringProxy && {
        /** Nur `npm run dev:vite` + Spring auf :8012. */
        proxy: {
          "/api": {
            target: "http://localhost:8012",
            changeOrigin: true,
            configure(proxy) {
              proxy.on("error", (err: NodeJS.ErrnoException) => {
                if (err?.code !== "ECONNREFUSED" || backendDownWarned) return;
                backendDownWarned = true;
                console.warn(
                  "\n[vite] /api → localhost:8012: Verbindung verweigert (Spring-Backend nicht gestartet).\n" +
                    "    Backend starten oder ohne Java: `npm run dev` (Electron).\n",
                );
              });
            },
          },
        },
      }),
    },
  };
});
