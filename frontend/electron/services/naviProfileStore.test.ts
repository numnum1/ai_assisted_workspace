import * as fs from "node:fs";
import * as path from "node:path";
import * as realOs from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NAVI_STATES } from "../../src/naviStateMachine.js";
import { NAVI_BUILTIN_PROFILE_ID } from "../../src/naviProfile.js";

/**
 * The store resolves `~/.writing-assistant/navi` from `os.homedir()` at module load, so every
 * test gets a throwaway home and a freshly imported module.
 */
let home: string;

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof realOs>("os");
  return { ...actual, homedir: () => home, default: { ...actual, homedir: () => home } };
});

type Store = typeof import("./naviProfileStore.js");

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("./naviProfileStore.js");
}

function naviDir(): string {
  return path.join(home, ".writing-assistant", "navi");
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(realOs.tmpdir(), "navi-profile-test-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("naviProfileStore", () => {
  it("starts on the read-only built-in profile", async () => {
    const store = await freshStore();
    expect(store.getActiveProfileId()).toBe(NAVI_BUILTIN_PROFILE_ID);
    expect(store.profileFilePath(store.STATES_FILE_NAME)).toBeNull();
    expect(store.loadNaviProfileBundle(NAVI_BUILTIN_PROFILE_ID).states).toEqual(
      DEFAULT_NAVI_STATES,
    );
    expect(store.listNaviProfiles().profiles).toHaveLength(1);
  });

  it("refuses writes while the built-in profile is active", async () => {
    const store = await freshStore();
    expect(() => store.assertActiveProfileWritable()).toThrow(store.NaviProfileError);
  });

  it("migrates pre-profile config files into a real profile", async () => {
    fs.mkdirSync(naviDir(), { recursive: true });
    const legacyStates = [{ ...DEFAULT_NAVI_STATES[0], label: "Angepasst" }];
    fs.writeFileSync(
      path.join(naviDir(), "states.json"),
      JSON.stringify(legacyStates),
      "utf-8",
    );

    const store = await freshStore();
    const index = store.listNaviProfiles();

    expect(index.activeProfileId).not.toBe(NAVI_BUILTIN_PROFILE_ID);
    expect(index.profiles.map((p) => p.name)).toContain("Eigenes Profil");
    expect(fs.existsSync(path.join(naviDir(), "states.json"))).toBe(false);
    expect(store.loadNaviProfileBundle(index.activeProfileId).states).toEqual(legacyStates);
  });

  it("forks the built-in profile into a writable copy", async () => {
    const store = await freshStore();
    const index = store.createNaviProfile({ name: "Marc (Kopie)" });

    expect(index.activeProfileId).not.toBe(NAVI_BUILTIN_PROFILE_ID);
    expect(() => store.assertActiveProfileWritable()).not.toThrow();
    expect(store.profileFilePath(store.STATES_FILE_NAME)).not.toBeNull();
    expect(store.loadNaviProfileBundle(index.activeProfileId).states).toEqual(
      DEFAULT_NAVI_STATES,
    );
  });

  it("keeps profile names unique", async () => {
    const store = await freshStore();
    store.createNaviProfile({ name: "Test" });
    const index = store.createNaviProfile({ name: "Test" });
    expect(index.profiles.map((p) => p.name)).toEqual(["Marc", "Test", "Test (2)"]);
  });

  it("never lets the built-in profile be renamed or deleted", async () => {
    const store = await freshStore();
    expect(() => store.renameNaviProfile(NAVI_BUILTIN_PROFILE_ID, "X")).toThrow();
    expect(() => store.deleteNaviProfile(NAVI_BUILTIN_PROFILE_ID)).toThrow();
  });

  it("falls back to the built-in profile when the active one is deleted", async () => {
    const store = await freshStore();
    const created = store.createNaviProfile({ name: "Weg damit" });
    const id = created.activeProfileId;

    const after = store.deleteNaviProfile(id);
    expect(after.activeProfileId).toBe(NAVI_BUILTIN_PROFILE_ID);
    expect(after.profiles.map((p) => p.id)).toEqual([NAVI_BUILTIN_PROFILE_ID]);
  });

  it("switching profiles switches which file the config is read from", async () => {
    const store = await freshStore();
    const a = store.createNaviProfile({ name: "A" }).activeProfileId;
    const pathA = store.profileFilePath(store.STATES_FILE_NAME);
    const b = store.createNaviProfile({ name: "B" }).activeProfileId;
    const pathB = store.profileFilePath(store.STATES_FILE_NAME);

    expect(a).not.toBe(b);
    expect(pathA).not.toBe(pathB);

    store.setActiveNaviProfile(a);
    expect(store.profileFilePath(store.STATES_FILE_NAME)).toBe(pathA);
  });
});
