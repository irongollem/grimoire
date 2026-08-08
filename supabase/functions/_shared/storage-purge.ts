/**
 * Recursive "every file under this folder" listing for GDPR account erasure
 * (#631).
 *
 * Supabase Storage's `list()` is one level deep — a sub-folder comes back as
 * an entry with `id === null` (Supabase's own signal that it's a folder, not
 * an object) rather than being expanded. Buckets under the `{userId}/` prefix
 * can nest arbitrarily (e.g. `mini-models/{userId}/{miniId}/model.glb`), so
 * purging an account has to walk the tree itself.
 *
 * The walk is a pure function over an injected `list` callback so it is
 * unit-testable without a network or a real Supabase client — the same shape
 * as the rest of `_shared` (see `r2/api.ts`).
 */

export interface StorageEntry {
  readonly name: string;
  /** Supabase Storage's own signal: null means "this is a folder, not a file". */
  readonly id: string | null;
}

export type ListFolder = (prefix: string) => Promise<StorageEntry[]>;

/**
 * Every file path under `prefix`, recursing into sub-folders. `prefix` has no
 * trailing slash (e.g. `"{userId}"` or `"{userId}/sub"`); returned paths are
 * bucket-relative, rooted at `prefix`.
 */
export async function listAllFilePaths(list: ListFolder, prefix: string): Promise<string[]> {
  const entries = await list(prefix);
  const paths: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await listAllFilePaths(list, path)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/** Split `items` into chunks of at most `size` — Storage's `remove()` takes a bounded list per call. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
