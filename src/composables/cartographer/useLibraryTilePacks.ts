import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { getPublicUrl } from "@/lib/storage";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import type { LibraryTilePack } from "@/cartographer/userPack.types";
import { cloneManifest } from "@/cartographer/cloneManifest";
import { assertWebp128 } from "@/cartographer/packUpload";
import { invokeTilePackGenerator } from "./tilePackGenerator";

/**
 * Exported because the generation loop lives in `useTilePacks` and drives
 * BOTH lanes (the edge function resolves the lane from the run row), so it
 * has to invalidate this lane's rows too — a library run that only
 * invalidated `user-tile-packs` left the pack editor and its slot grid
 * showing blank cells until a manual page refresh.
 */
export const LIBRARY_PACKS_KEY = "library-tile-packs";

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

  /**
   * `update`, `uploadTile` and `generateMissing` route through the edge
   * function for the same reason as every mutation above, plus a second,
   * stronger one for the latter two: the `library-tile-packs` bucket is
   * declared `clientWrites: false` in `supabase/functions/_shared/storage-policy.ts`,
   * so no browser can write these bytes at all — the edge function is not an
   * extra hop around a client write, it is the only path that exists.
   */
  const update = useMutation({
    mutationFn: (input: {
      packRowId: string;
      name?: string;
      description?: string;
      licenseKeys?: string[];
      contentSourceKey?: string | null;
      sortOrder?: number;
    }) =>
      invokeTilePackGenerator<{ pack: LibraryTilePack }>({
        action: "update_library_pack",
        pack_id: input.packRowId,
        // Only the keys actually supplied go on the wire: `undefined` means
        // "leave it", `null` (for contentSourceKey) is a meaningful clear.
        // Spreading a conditional object per field keeps `undefined` from
        // ever being serialized, which `{ ...input }` would not.
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.licenseKeys !== undefined ? { license_keys: input.licenseKeys } : {}),
        ...(input.contentSourceKey !== undefined ? { content_source_key: input.contentSourceKey } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      }),
    onSuccess: invalidate,
  });

  const uploadTile = useMutation({
    mutationFn: async (input: {
      packRowId: string;
      slot: { category: string; side?: string; variant: number };
      file: File | Blob;
    }) => {
      const label = `${input.slot.category}${input.slot.side ? `/${input.slot.side}` : ""}/${input.slot.variant}`;
      // Validate before spending a round trip: a 128×128 WebP check is free
      // here and catches the mistake before a doomed payload reaches the edge
      // function, whose own rejection would otherwise be the only feedback.
      await assertWebp128(input.file, label);
      const image_b64 = await blobToBase64(input.file);
      return invokeTilePackGenerator<{ slot_id: string; relative_path: string; byte_size: number }>({
        action: "upload_library_tile",
        pack_id: input.packRowId,
        slot: {
          category: input.slot.category,
          ...(input.slot.side ? { side: input.slot.side } : {}),
          variant: input.slot.variant,
        },
        image_b64,
      });
    },
    onSuccess: invalidate,
  });

  const generateMissing = useMutation({
    mutationFn: (input: { packRowId: string; slotIds?: string[] }) =>
      invokeTilePackGenerator<{ run_id: string; total_jobs: number; status: "proof_pending" | "generating" }>({
        action: "generate_library_pack",
        pack_id: input.packRowId,
        ...(input.slotIds ? { slot_ids: input.slotIds } : {}),
      }),
    onSuccess: invalidate,
  });

  return { packs, publishedPacks, createRun, publish, unpublish, remove, update, uploadTile, generateMissing };
}

/**
 * Base64-encode a blob for the edge function's `image_b64` fields.
 *
 * Deliberately a byte-by-byte loop rather than
 * `btoa(String.fromCharCode(...bytes))` — spreading a `Uint8Array` into
 * `String.fromCharCode` blows the engine's argument-count limit on anything
 * past a few tens of KB, which a generated or scanned tile can exceed even at
 * 128×128. Mirrors `useTilePacks.ts`'s `toBase64`; not shared because that one
 * is local to its own module and neither composable is the other's dependency.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface LibraryPackErrorDetail {
  message?: string;
  required?: number;
  requiredDrawn?: number;
}

/**
 * Translate an edge-function error code into a sentence a DM can act on.
 *
 * `LibraryTilePackPanel.vue` and `LibraryTilePackRow.vue` each carry their own
 * local `describeCreateError` / `describeError` today, covering only the codes
 * their own actions could throw. A third copy for these three new mutations is
 * exactly what CLAUDE.md's extraction rule exists to prevent, so this is the
 * one place going forward — those two components should adopt it rather than
 * grow a fourth translation of the same codes.
 */
export function describeLibraryPackError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  const detail = caught as LibraryPackErrorDetail | null;
  switch (message) {
    case "admin_required":
      return "Only an admin can manage library packs.";
    case "pack_not_found":
      return "That library pack no longer exists.";
    case "invalid_pack_id":
      return 'That pack id isn\'t valid — use lowercase letters, numbers and hyphens, and it can\'t start with "custom-".';
    case "invalid_pack_concept":
      return "Give the pack a name (a description over 1000 characters won't fit).";
    case "invalid_license_keys":
      return "One or more of those licenses isn't recognized.";
    case "invalid_content_source":
      return "That content source isn't recognized.";
    case "invalid_sort_order":
      return "Sort order must be a whole number.";
    case "no_changes":
      return "Nothing to save — change a field first.";
    case "invalid_slot":
      return "That tile slot isn't part of this pack's schema.";
    case "image_too_large":
      return "That image is too large to upload.";
    case "invalid_image":
      return "That file isn't a valid 128×128 WebP tile.";
    case "generation_already_running":
      return "This pack already has a generation run in progress.";
    case "nothing_to_generate":
      return "Every slot already has art — there is nothing left to generate.";
    case "unknown_slot_id":
      return "One of those slots isn't part of this pack's schema.";
    case "pack_incomplete": {
      if (typeof detail?.required === "number" && typeof detail?.requiredDrawn === "number") {
        const missing = detail.required - detail.requiredDrawn;
        return `This pack still has ${missing} unfilled required slot${missing === 1 ? "" : "s"} — finish generating it before publishing.`;
      }
      return "This pack still has unfilled slots — finish generating it before publishing.";
    }
    case "unpublish_before_deleting":
      return "Unpublish this pack before deleting it.";
    case "cancel_generation_before_deleting":
      return "Cancel this pack's generation run before deleting it.";
    default:
      return message;
  }
}
