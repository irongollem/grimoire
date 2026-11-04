import { supabase } from "@/lib/supabase";
import type { Sound, SoundboardPadWithTakes, SoundboardPage, SoundboardPlaylist } from "@/types/sound.types";

/**
 * The deck's reads, batched (#1136, #1138).
 *
 * The deck docks under every DM page and shows a row of pads at once, so a cold
 * start reads its pads, lanes, playlists and sounds together, and so does every
 * resume (the wake-up heal refetches every live query at once). As four requests
 * they took both over their request budgets (scripts/perf/budgets.json).
 *
 * Reads of different slices of one campaign that start in the same task share
 * one request: PostgREST embeds each asked table under the campaign row, and
 * every embed is still read through that table's own RLS. A slice read alone (a
 * ring for one table, an invalidation after a write) is that table's own
 * request, so a changed sound never re-downloads the pads.
 */

export type DeckSlice = "pads" | "pages" | "playlists" | "sounds";

export interface DeckSlices {
  pads: SoundboardPadWithTakes[];
  pages: SoundboardPage[];
  playlists: SoundboardPlaylist[];
  sounds: Sound[];
}

const EMBEDS: Record<DeckSlice, string> = {
  pads: "pads:soundboard_pads(*, takes:soundboard_pad_takes(*))",
  pages: "pages:soundboard_pages(*)",
  playlists: "playlists:soundboard_playlists(*)",
  sounds: "sounds(*)",
};

interface Waiting {
  slice: DeckSlice;
  own: () => Promise<unknown>;
  resolve: (rows: unknown) => void;
  reject: (error: unknown) => void;
}

const batches = new Map<string, Waiting[]>();

async function fetchSlices(campaignId: string, slices: readonly DeckSlice[]): Promise<Partial<DeckSlices>> {
  let query = supabase
    .from("campaigns")
    .select(slices.map((slice) => EMBEDS[slice]).join(", "))
    .eq("id", campaignId);
  // The order each table's own read asks for.
  if (slices.includes("pages")) {
    query = query
      .order("sort_order", { referencedTable: "soundboard_pages", ascending: true })
      .order("name", { referencedTable: "soundboard_pages", ascending: true });
  }
  if (slices.includes("playlists")) {
    query = query
      .order("sort_order", { referencedTable: "soundboard_playlists", ascending: true })
      .order("name", { referencedTable: "soundboard_playlists", ascending: true });
  }
  if (slices.includes("sounds")) query = query.order("name", { referencedTable: "sounds", ascending: true });
  const { data, error } = await query.single();
  if (error) throw error;
  return data as unknown as Partial<DeckSlices>;
}

function flush(campaignId: string): void {
  const waiting = batches.get(campaignId) ?? [];
  batches.delete(campaignId);
  const slices = [...new Set(waiting.map((w) => w.slice))];
  if (slices.length === 1) {
    for (const w of waiting) w.own().then(w.resolve, w.reject);
    return;
  }
  fetchSlices(campaignId, slices).then(
    (rows) => {
      for (const w of waiting) w.resolve(rows[w.slice] ?? []);
    },
    (error: unknown) => {
      for (const w of waiting) w.reject(error);
    },
  );
}

/**
 * Read one slice of a campaign's deck. Reads of other slices that start in the
 * same task are fetched with it in one request; alone, it is `own()`.
 */
export function readDeckSlice<S extends DeckSlice>(
  campaignId: string,
  slice: S,
  own: () => Promise<DeckSlices[S]>,
): Promise<DeckSlices[S]> {
  return new Promise<DeckSlices[S]>((resolve, reject) => {
    const waiting = batches.get(campaignId);
    const entry: Waiting = { slice, own, resolve: resolve as (rows: unknown) => void, reject };
    if (waiting) {
      waiting.push(entry);
      return;
    }
    batches.set(campaignId, [entry]);
    // A macrotask, not a microtask: queries that mount or refetch together are
    // started across several promise turns of the same task.
    setTimeout(() => flush(campaignId), 0);
  });
}
