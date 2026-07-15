import "./installConsoleTimestamps.js";
import { app, BrowserWindow, ipcMain, Menu, MenuItem, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startChatStream,
  stopChatStream,
  generateSimulatedUserReply,
  type SimulatedUserReplyRequest,
  evaluateNaviSimulation,
  type EvaluateNaviSimulationRequest,
} from "./services/chatService.js";
import {
  createProvider,
  deleteProvider,
  listPublicProviders,
  updateProvider,
} from "./services/aiProviderService.js";
import {
  listPersonas,
  readPersona,
  writePersona,
  deletePersona,
} from "./services/personaService.js";
import {
  getPreferences,
  patchPreferences,
} from "./services/preferencesService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function registerIpcHandlers(): void {
  ipcMain.handle("chat:startStream", (event, body) => {
    const { streamId } = startChatStream(body, (chatEvent) => {
      event.sender.send("chat:streamEvent", {
        streamId,
        event: chatEvent.type,
        data:
          typeof chatEvent.data === "string"
            ? chatEvent.data
            : JSON.stringify(chatEvent.data),
      });
    });
    return { streamId };
  });
  ipcMain.handle("chat:stopStream", (_event, streamId: string) =>
    stopChatStream(streamId),
  );

  ipcMain.handle("llms:list", () => listPublicProviders());
  ipcMain.handle("llms:create", (_event, body) => createProvider(body));
  ipcMain.handle("llms:update", (_event, id: string, body) =>
    updateProvider(id, body),
  );
  ipcMain.handle("llms:remove", (_event, id: string) => deleteProvider(id));

  ipcMain.handle(
    "simulation:generateUserReply",
    (_event, req: SimulatedUserReplyRequest) =>
      generateSimulatedUserReply(req),
  );
  ipcMain.handle(
    "simulation:evaluateRun",
    (_event, req: EvaluateNaviSimulationRequest) =>
      evaluateNaviSimulation(req),
  );

  ipcMain.handle("persona:list", () => listPersonas());
  ipcMain.handle("persona:read", (_event, id: string) => readPersona(id));
  ipcMain.handle(
    "persona:write",
    (_event, name: string, description: string) =>
      writePersona(name, description),
  );
  ipcMain.handle("persona:delete", (_event, id: string) => deletePersona(id));

  ipcMain.handle("preferences:get", () => getPreferences());
  ipcMain.handle("preferences:set", (_event, patch) =>
    patchPreferences(patch),
  );

  ipcMain.handle("spellcheck:fixAtCursor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { status: "no-window" };
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
      return { status: "cursor-outside-window" };
    }
    pendingSpellFixWindowId = win.id;
    win.webContents.sendInputEvent({
      type: "mouseDown",
      x,
      y,
      button: "right",
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x,
      y,
      button: "right",
      clickCount: 1,
    });
    return { status: "ok" };
  });

  ipcMain.handle("shell:openDevTools", (event) => {
    console.log("[electron] Received shell:openDevTools");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.openDevTools();
      console.log("[electron] Finished shell:openDevTools");
    } else {
      console.warn("[electron] shell:openDevTools: no window for sender");
    }
  });
}

/** Set by the `spellcheck:fixAtCursor` IPC handler right before it simulates a right-click
 * to trigger Chromium's native context-menu event; tells that handler to silently apply the
 * first suggestion instead of popping up the menu. */
let pendingSpellFixWindowId: number | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      /** CJS-Bundle (`preload.cjs` via esbuild): `tsc`-ESM-Preload + `"type":"module"` führt oft dazu, dass der Preload nicht läuft → kein `window.appBridge`. */
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(
      `[electron] preload-error path=${preloadPath}`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
  });
  // win.webContents.openDevTools();

  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.on("context-menu", (_event, params) => {
    if (pendingSpellFixWindowId === win.id) {
      pendingSpellFixWindowId = null;
      if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
        win.webContents.replaceMisspelling(params.dictionarySuggestions[0]);
      }
      return;
    }

    const menu = new Menu();

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion),
          }),
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(
        new MenuItem({
          label: "Zum Wörterbuch hinzufügen",
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        }),
      );
      menu.append(new MenuItem({ type: "separator" }));
    }

    if (params.isEditable) {
      menu.append(
        new MenuItem({
          label: "Ausschneiden",
          role: "cut",
          enabled: params.editFlags.canCut,
        }),
      );
      menu.append(
        new MenuItem({
          label: "Kopieren",
          role: "copy",
          enabled: params.editFlags.canCopy,
        }),
      );
      menu.append(
        new MenuItem({
          label: "Einfügen",
          role: "paste",
          enabled: params.editFlags.canPaste,
        }),
      );
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: "Kopieren", role: "copy" }));
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  if (!app.isPackaged) {
    void win.loadURL("http://localhost:5173");
  } else {
    /** `main` liegt unter `dist-electron/electron/`; Vite-Build ist `dist/` neben `dist-electron/`. */
    void win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
