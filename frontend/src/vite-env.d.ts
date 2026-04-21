/// <reference types="vite/client" />

import type { AppBridge } from './electron/bridge';

declare global {
  interface Window {
    appBridge?: AppBridge;
  }
}

export {};
