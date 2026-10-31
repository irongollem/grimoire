import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteLocalMap,
  getLocalMap,
  localMediaSupported,
  requestPersistence,
  resetPersistenceAskedForTests,
  saveLocalMap,
} from "./localMedia";

// Minimal in-memory stand-in for the OPFS directory handle API.
function notFound() {
  return new DOMException("not found", "NotFoundError");
}
class FakeDir {
  files = new Map<string, Blob>();
  dirs = new Map<string, FakeDir>();
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw notFound();
      d = new FakeDir();
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw notFound();
      this.files.set(name, new Blob([]));
    }
    return {
      getFile: async () => this.files.get(name) as File,
      createWritable: async () => {
        let data: Blob = new Blob([]);
        return {
          write: async (d: Blob | string) => { data = new Blob([d]); },
          close: async () => { this.files.set(name, data); },
        };
      },
    };
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name)) throw notFound();
  }
}

let root: FakeDir;
const persist = vi.fn(async () => true);

beforeEach(() => {
  root = new FakeDir();
  persist.mockClear();
  resetPersistenceAskedForTests();
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root, persist } });
});
afterEach(() => vi.unstubAllGlobals());

const gif = () => new File(["GIF89a-bytes"], "tavern.gif", { type: "image/gif" });

describe("localMedia", () => {
  it("keeps a moving map under map-media/ and gives back the same bytes, name and type", async () => {
    expect(await saveLocalMap("loc-1", gif())).toBe(true);
    expect(root.dirs.has("map-media")).toBe(true);
    const back = await getLocalMap("loc-1");
    expect(back?.name).toBe("tavern.gif");
    expect(back?.type).toBe("image/gif");
    expect(await back?.text()).toBe("GIF89a-bytes");
    expect(await getLocalMap("loc-1")).not.toBeNull();
  });

  it("reports a location with nothing saved as absent, not as an error", async () => {
    expect(await getLocalMap("never")).toBeNull();
    expect(await getLocalMap("never")).toBeNull();
  });

  it("replaces an earlier copy when the DM brings a new map", async () => {
    await saveLocalMap("loc-1", gif());
    await saveLocalMap("loc-1", new File(["newer"], "new.webm", { type: "video/webm" }));
    const back = await getLocalMap("loc-1");
    expect(await back?.text()).toBe("newer");
    expect(back?.type).toBe("video/webm");
  });

  it("deletes the map and its sidecar, and deleting twice is fine", async () => {
    await saveLocalMap("loc-1", gif());
    await deleteLocalMap("loc-1");
    expect(await getLocalMap("loc-1")).toBeNull();
    expect(root.dirs.get("map-media")?.files.size).toBe(0);
    await expect(deleteLocalMap("loc-1")).resolves.toBeUndefined();
  });

  it("still returns the bytes when the sidecar is missing", async () => {
    await saveLocalMap("loc-1", gif());
    root.dirs.get("map-media")?.files.delete("loc-1.meta");
    const back = await getLocalMap("loc-1");
    expect(await back?.text()).toBe("GIF89a-bytes");
  });

  it("refuses a key that could climb out of the directory", async () => {
    expect(await saveLocalMap("../x", gif())).toBe(false);
    expect(await getLocalMap("a/b")).toBeNull();
    expect(root.dirs.size).toBe(0);
  });

  it("answers false and null, without throwing, when OPFS is missing", async () => {
    vi.stubGlobal("navigator", {});
    expect(localMediaSupported()).toBe(false);
    expect(await saveLocalMap("loc-1", gif())).toBe(false);
    expect(await getLocalMap("loc-1")).toBeNull();
    expect(await getLocalMap("loc-1")).toBeNull();
    await expect(deleteLocalMap("loc-1")).resolves.toBeUndefined();
    expect(await requestPersistence()).toBe(false);
  });

  it("answers false when the browser refuses the write", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => { throw new Error("SecurityError"); } } });
    expect(await saveLocalMap("loc-1", gif())).toBe(false);
  });

  it("asks for persistence once per page load", async () => {
    expect(await requestPersistence()).toBe(true);
    await requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
