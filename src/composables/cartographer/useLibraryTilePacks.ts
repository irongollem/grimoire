import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { getPublicUrl } from "@/lib/storage";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import type { LibraryTilePack } from "@/cartographer/userPack.types";
import { cloneManifest } from "@/cartographer/cloneManifest";
import { invokeTilePackGenerator } from "./tilePackGenerator";

const LIBRARY_PACKS_KEY = "library-tile-packs";

/**
 * Where a library pack's objects live: `<row id>/v<version>/<relative>`.
 *
 * Keyed by the row's **uuid**, never its slug. A library pack is authored in
 * the open — tiles land in the bucket slot by slot, weeks before anyone
 * publishes it — and every registry bucket's bytes are read back through the
 * CDN Worker, which consults neither storage RLS nor the bucket's `public`
 * flag. So confidentiality here comes from the path being unguessable, exactly
 * as it does for every other bucket in the app; a name-derived path would put
 * an unannounced pack one guess away. The edge function mints the same shape
 * (`packTarget.ts`), and this is the reader's half of that agreement.
 */
export function libraryPackObjectPath(pack: Pick<LibraryTilePack, "id" | "pack_version">, relative: string): string {
  return `${pack.id}/v${pack.pack_version}/${relative}`;
}

async function fetchLibraryPacks(): Promise<LibraryTilePack[]> {
  // No status filter here on purpose: RLS already decides what the caller may
  // see — published only, or everything for an app admin. Filtering again in
  // the client would mean the admin panel and the Cartographer needed two
  // different queries to ask the same question, and one of them would drift.
  const { data, error } = await supabase.from("library_tile_packs")
    .select("*").order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as LibraryTilePack[];
}

/**
 * Load a library pack's runtime from its public, CDN-fronted bytes.
 *
 * The sibling `loadUserPack` signs a URL per tile, because a DM's pack is
 * private. This one must not: a map render pulls 20-60 tiles at once and these
 * are shared content, so signing would add a round trip and an expiry to bytes
 * that are meant to be read by everyone.
 */
export async function loadLibraryPack(pack: LibraryTilePack): Promise<TilePackRuntime> {
  const manifest = cloneManifest(pack.manifest);
  for (const entries of Object.values(manifest.assets)) {
    for (const slot of entries ?? []) {
      slot.url = getPublicUrl("libraryTilePacks", libraryPackObjectPath(pack, slot.url));
    }
  }
  const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  try { return await loadPack(manifestUrl); } finally { URL.revokeObjectURL(manifestUrl); }
}

/**
 * Shared tile packs: the read every DM makes, and the writes only an admin can.
 *
 * The mutations all route through the `tile-pack-generator` edge function
 * rather than writing the table directly, even though the admin RLS policies
 * would allow a direct write. Publishing in particular has to: it re-validates
 * the manifest server-side first, and a published pack with missing slots
 * breaks the Cartographer for every DM who picks it — a check RLS cannot make.
 */
export function useLibraryTilePacks() {
  const queryClient = useQueryClient();
  const packs = useQuery({ queryKey: [LIBRARY_PACKS_KEY], queryFn: fetchLibraryPacks });

  /** What a DM's pack picker offers. An admin's own query returns drafts too,
   *  which must never reach the picker — an unfinished pack renders as holes. */
  const publishedPacks = computed(() => (packs.data.value ?? []).filter((pack) => pack.status === "published"));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [LIBRARY_PACKS_KEY] });

  const createRun = useMutation({
    mutationFn: (input: { name: string; description: string; packId?: string }) =>
      invokeTilePackGenerator<{ run_id: string; pack_id: string; total_jobs: number }>({
        action: "create_library",
        name: input.name,
        description: input.description,
        ...(input.packId ? { pack_id: input.packId } : {}),
      }),
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: (packRowId: string) =>
      invokeTilePackGenerator<{ status: "published" }>({ action: "publish_library_pack", pack_id: packRowId }),
    onSuccess: invalidate,
  });

  const unpublish = useMutation({
    mutationFn: (packRowId: string) =>
      invokeTilePackGenerator<{ status: "archived" }>({ action: "unpublish_library_pack", pack_id: packRowId }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (packRowId: string) =>
      invokeTilePackGenerator<{ deleted: true }>({ action: "delete_library_pack", pack_id: packRowId }),
    onSuccess: invalidate,
  });

  return { packs, publishedPacks, createRun, publish, unpublish, remove };
}
