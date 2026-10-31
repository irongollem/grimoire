/**
 * Moving maps (GIF, animated WebP, APNG, WebM, MP4) never go to R2. They are
 * copied into the browser's Origin Private File System on the DM's device and
 * only a WebP poster is uploaded (#1125 decision 6). Keys are location ids.
 *
 * Every function is safe where OPFS is missing or refuses (private windows,
 * old Safari): it answers false or null and never throws to the caller.
 */

const DIR = "map-media";
const META_SUFFIX = ".meta";
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

interface StoredMeta {
  name: string;
  type: string;
}

export function localMediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function mediaDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!localMediaSupported()) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create });
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && e.name === "NotFoundError";
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  try {
    await w.write(data);
  } finally {
    await w.close();
  }
}

export async function saveLocalMap(key: string, file: File): Promise<boolean> {
  if (!SAFE_KEY.test(key)) return false;
  try {
    const dir = await mediaDir(true);
    if (!dir) return false;
    const meta: StoredMeta = { name: file.name, type: file.type };
    await writeFile(dir, key, file);
    await writeFile(dir, key + META_SUFFIX, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

function isMeta(v: unknown): v is StoredMeta {
  return (
    typeof v === "object" && v !== null &&
    typeof (v as StoredMeta).name === "string" && typeof (v as StoredMeta).type === "string"
  );
}

export async function getLocalMap(key: string): Promise<File | null> {
  if (!SAFE_KEY.test(key)) return null;
  try {
    const dir = await mediaDir(false);
    if (!dir) return null;
    const stored = await (await dir.getFileHandle(key)).getFile();
    let meta: StoredMeta = { name: key, type: "" };
    try {
      const parsed: unknown = JSON.parse(await (await (await dir.getFileHandle(key + META_SUFFIX)).getFile()).text());
      if (isMeta(parsed)) meta = parsed;
    } catch {
      // Without the sidecar the bytes are still playable; the browser sniffs the type.
    }
    return new File([stored], meta.name, { type: meta.type });
  } catch {
    return null;
  }
}

export async function hasLocalMap(key: string): Promise<boolean> {
  if (!SAFE_KEY.test(key)) return false;
  try {
    const dir = await mediaDir(false);
    if (!dir) return false;
    await dir.getFileHandle(key);
    return true;
  } catch {
    return false;
  }
}

export async function deleteLocalMap(key: string): Promise<void> {
  if (!SAFE_KEY.test(key)) return;
  try {
    const dir = await mediaDir(false);
    if (!dir) return;
    for (const name of [key, key + META_SUFFIX]) {
      try {
        await dir.removeEntry(name);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }
  } catch {
    // Nothing stored, or storage refused: either way there is nothing left to remove.
  }
}

let persistenceAsked = false;

/** Ask the browser not to evict our maps. Asked once per page load; returns whether it was granted. */
export async function requestPersistence(): Promise<boolean> {
  if (persistenceAsked || !localMediaSupported() || typeof navigator.storage.persist !== "function") return false;
  persistenceAsked = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Test seam: forget that persistence was asked. */
export function resetPersistenceAskedForTests() {
  persistenceAsked = false;
}
