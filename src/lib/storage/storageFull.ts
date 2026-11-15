/**
 * The seam between the upload layer and whatever tells the user their storage
 * is used up (#1182). `src/lib/` may not import composables, so the upload code
 * announces here and a composable in `billing/` listens; no Vue in this file.
 */

export type StorageFullKind = "pictures" | "files";

type Listener = (kind: StorageFullKind) => void;

const listeners = new Set<Listener>();

/** Subscribe; returns the unsubscribe. */
export function onStorageFull(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyStorageFull(kind: StorageFullKind): void {
  for (const listener of listeners) listener(kind);
}

/** "pictures" only when everything being stored is an image; any other file makes it "files". */
export function storageFullKind(contentTypes: readonly string[]): StorageFullKind {
  return contentTypes.every((t) => t.startsWith("image/")) ? "pictures" : "files";
}
