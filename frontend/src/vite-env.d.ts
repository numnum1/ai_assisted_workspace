/// <reference types="vite/client" />

import type { AppBridge } from './shared/electron/bridge';

declare global {
  interface Window {
    appBridge?: AppBridge;
  }
}

export {};
