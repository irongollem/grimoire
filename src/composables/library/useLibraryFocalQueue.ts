import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import {
  buildFocalQueue,
  type FocalKind,
  type FocalPointValue,
  type FocalQueueEntry,
  type QueueArtRow,
  type QueueLibraryRow,
  sortFocalQueue,
} from "@/lib/library/focalQueue";
import {
  MONSTER_CANONICAL_ART,
  SPELL_CANONICAL_ART,
  writeCanonicalLibraryArt,
} from "@/composables/library/writeCanonicalLibraryArt";

export const FOCAL_QUEUE_QUERY_KEY = "library-focal-queue";

/** PostgREST caps a response at 1000 rows, and the library holds ~2,500 pictures. */
const PAGE = 1000;

interface Page<T> {
  data: T[] | null;
  error: Error | null;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    if (!data) throw new Error("Library art read returned no data");
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

interface CanonicalRow {
  entry_id: string;
  image_url: string | null;
  portrait_focal_point: FocalPointValue | null;
  focal_point_checked_at: string | null;
}
interface DefaultsRow {
  content_name: string;
  image_url: string | null;
  image_focal_point: FocalPointValue | null;
  focal_point_checked_at: string | null;
}
interface MonsterRow {
  name: string;
  image_url: string | null;
  portrait_focal_point: FocalPointValue | null;
}
interface ImageFocalRow {
  name: string;
  image_url: string | null;
  image_focal_point: FocalPointValue | null;
}

function canonicalArt(row: CanonicalRow): QueueArtRow {
  return {
    key: row.entry_id,
    imageUrl: row.image_url,
    focalPoint: row.portrait_focal_point,
    checkedAt: row.focal_point_checked_at,
  };
}

async function loadQueue(kind: FocalKind): Promise<FocalQueueEntry[]> {
  if (kind === "item") {
    const [defaults, items] = await Promise.all([
      fetchAll<DefaultsRow>((from, to) =>
        supabase
          .from("library_art_defaults")
          .select("content_name, image_url, image_focal_point, focal_point_checked_at")
          .eq("content_type", "item")
          .order("content_name")
          .range(from, to),
      ),
      fetchAll<ImageFocalRow>((from, to) =>
        supabase.from("library_items").select("id, name, image_url, image_focal_point").order("id").range(from, to),
      ),
    ]);
    return buildFocalQueue(
      "item",
      defaults.map((row) => ({
        key: row.content_name,
        imageUrl: row.image_url,
        focalPoint: row.image_focal_point,
        checkedAt: row.focal_point_checked_at,
      })),
      items.map((row): QueueLibraryRow => ({ name: row.name, imageUrl: row.image_url, focalPoint: row.image_focal_point })),
    );
  }

  if (kind === "spell") {
    const [canonical, spells] = await Promise.all([
      fetchAll<CanonicalRow>((from, to) =>
        supabase
          .from("library_spell_art_canonical")
          .select("entry_id, image_url, portrait_focal_point, focal_point_checked_at")
          .order("entry_id")
          .range(from, to),
      ),
      fetchAll<ImageFocalRow>((from, to) =>
        supabase.from("library_spells").select("id, name, image_url, image_focal_point").order("id").range(from, to),
      ),
    ]);
    return buildFocalQueue(
      "spell",
      canonical.map(canonicalArt),
      spells.map((row): QueueLibraryRow => ({ name: row.name, imageUrl: row.image_url, focalPoint: row.image_focal_point })),
    );
  }

  const [canonical, monsters] = await Promise.all([
    fetchAll<CanonicalRow>((from, to) =>
      supabase
        .from("library_monster_art_canonical")
        .select("entry_id, image_url, portrait_focal_point, focal_point_checked_at")
        .order("entry_id")
        .range(from, to),
    ),
    fetchAll<MonsterRow>((from, to) =>
      supabase.from("library_monsters").select("id, name, image_url, portrait_focal_point").order("id").range(from, to),
    ),
  ]);
  return buildFocalQueue(
    "monster",
    canonical.map(canonicalArt),
    monsters.map((row): QueueLibraryRow => ({ name: row.name, imageUrl: row.image_url, focalPoint: row.portrait_focal_point })),
  );
}

const STAMP_TABLE = {
  monster: "library_monster_art_canonical",
  spell: "library_spell_art_canonical",
  item: "library_art_defaults",
} as const;

/** Every query a focal point change can make stale, per kind. */
const INVALIDATE: Record<FocalKind, string[]> = {
  monster: ["library-monster-art", "library-monsters"],
  spell: ["library-spell-art", "library-spells"],
  item: ["library-art-defaults", "library-items"],
};

/** Marks every art row of the picture as seen by a person. */
async function stampChecked(kind: FocalKind, imageUrl: string): Promise<void> {
  const base = supabase
    .from(STAMP_TABLE[kind])
    .update({ focal_point_checked_at: new Date().toISOString() })
    .eq("image_url", imageUrl);
  const { error } = await (kind === "item" ? base.eq("content_type", "item") : base);
  if (error) throw error;
}

/**
 * Items have no canonical-art writer: the point lives on the defaults row and
 * on every library item showing the picture, so both are written here.
 */
async function writeItemFocalPoint(imageUrl: string, point: FocalPointValue): Promise<void> {
  const defaults = await supabase
    .from("library_art_defaults")
    .update({ image_focal_point: point })
    .eq("content_type", "item")
    .eq("image_url", imageUrl);
  if (defaults.error) throw defaults.error;
  const items = await supabase.from("library_items").update({ image_focal_point: point }).eq("image_url", imageUrl);
  if (items.error) throw items.error;
}

async function writeFocalPoint(entry: FocalQueueEntry, point: FocalPointValue): Promise<void> {
  if (entry.kind === "item") {
    await writeItemFocalPoint(entry.imageUrl, point);
    return;
  }
  const [entryId] = entry.keys;
  if (entryId === undefined) throw new Error("This picture has no library entry to write to");
  await writeCanonicalLibraryArt(entry.kind === "monster" ? MONSTER_CANONICAL_ART : SPELL_CANONICAL_ART, {
    entry_id: entryId,
    portrait_focal_point: point,
  });
}

/**
 * The review queue behind the admin focal-point panel. `entries` is every
 * picture of the selected kind, unchecked first; filtering by status is the
 * caller's, so the viewer can keep walking a list that a save just shortened.
 */
export function useLibraryFocalQueue(kind: MaybeRefOrGetter<FocalKind>) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: computed(() => [FOCAL_QUEUE_QUERY_KEY, toValue(kind)] as const),
    queryFn: () => loadQueue(toValue(kind)),
    // The queue is a working list the admin edits: a refetch on focus would
    // reshuffle it under the cursor.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * The queue is patched in the cache rather than refetched: a refetch re-reads
   * both library tables (thousands of rows) after every key press, which would
   * make "accept and move on" the slowest thing in the panel. The library art
   * and list queries do refetch, lazily, because other screens read them.
   */
  function applySaved(entry: FocalQueueEntry, point: FocalPointValue | null) {
    queryClient.setQueryData<FocalQueueEntry[]>([FOCAL_QUEUE_QUERY_KEY, entry.kind], (current) => {
      if (!current) return current;
      const stamped = new Date().toISOString();
      return sortFocalQueue(
        current.map((row) =>
          row.imageUrl === entry.imageUrl
            ? { ...row, checkedAt: stamped, focalPoint: point === null ? row.focalPoint : point }
            : row,
        ),
      );
    });
    for (const key of INVALIDATE[entry.kind]) void queryClient.invalidateQueries({ queryKey: [key] });
  }

  const setFocalPoint = useMutation({
    mutationFn: async ({ entry, point }: { entry: FocalQueueEntry; point: FocalPointValue }) => {
      await writeFocalPoint(entry, point);
      await stampChecked(entry.kind, entry.imageUrl);
    },
    onSuccess: (_data, { entry, point }) => applySaved(entry, point),
  });

  const acceptFocalPoint = useMutation({
    mutationFn: ({ entry }: { entry: FocalQueueEntry }) => stampChecked(entry.kind, entry.imageUrl),
    onSuccess: (_data, { entry }) => applySaved(entry, null),
  });

  const entries = computed(() => (query.data.value === undefined ? [] : query.data.value));

  return { query, entries, setFocalPoint, acceptFocalPoint };
}
