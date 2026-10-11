import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { uploadWithVariants } from "@/lib/storage/upload";
import { toWebP } from "@/lib/mediaConvert";
import type { BucketKey } from "@/lib/storage/buckets";
import {
  buildFocalQueue,
  buildNamedFocalQueue,
  isNamedKind,
  type NamedFocalKind,
  type QueueNamedRow,
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

/**
 * The three name-grouped kinds live in different tables with different name
 * columns; every other column used exists on all three.
 */
interface NamedConfig {
  table: "library_species" | "library_backgrounds" | "system_classes";
  nameColumn: "name" | "class_name";
  bucket: BucketKey;
}
const NAMED_CONFIG: Record<NamedFocalKind, NamedConfig> = {
  species: { table: "library_species", nameColumn: "name", bucket: "speciesImages" },
  background: { table: "library_backgrounds", nameColumn: "name", bucket: "backgroundImages" },
  class: { table: "system_classes", nameColumn: "class_name", bucket: "classImages" },
};

function namedTable(kind: NamedFocalKind) {
  return supabase.from(NAMED_CONFIG[kind].table);
}

/** `name` is aliased from `class_name` for system_classes, so all three read alike. */
interface NamedRow {
  id: string;
  name: string | null;
  image_url: string | null;
  focal_point: FocalPointValue | null;
  focal_point_checked_at: string | null;
}

async function loadNamedQueue(kind: NamedFocalKind): Promise<FocalQueueEntry[]> {
  const { table, nameColumn } = NAMED_CONFIG[kind];
  const rows = await fetchAll<NamedRow>((from, to) =>
    supabase
      .from(table)
      .select(`id, name:${nameColumn}, image_url, focal_point, focal_point_checked_at`)
      .order("id")
      .range(from, to),
  );
  return buildNamedFocalQueue(
    kind,
    rows.map((row): QueueNamedRow => {
      const { name } = row;
      if (name === null) throw new Error(`${table} row ${row.id} has no name`);
      return {
        id: row.id,
        name,
        imageUrl: row.image_url,
        focalPoint: row.focal_point,
        checkedAt: row.focal_point_checked_at,
      };
    }),
  );
}

async function loadQueue(kind: FocalKind): Promise<FocalQueueEntry[]> {
  if (isNamedKind(kind)) return loadNamedQueue(kind);
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
const INVALIDATE: Record<FocalKind, readonly (readonly string[])[]> = {
  monster: [
    ["library-monster-art"], ["library-monster-index"], ["library-monsters"],
    ["monsters", "browse"], ["monsters", "by-ids"], ["resolved-monster"],
  ],
  spell: [
    ["library-spell-art"], ["library-spell-index"], ["library-spells"],
    ["spells", "browse"], ["spells", "by-ids"],
  ],
  item: [
    ["library-art-defaults"], ["library-item-index"], ["items", "browse"], ["items", "by-ids"],
    ["resolved-library-items"], ["resolved-item"],
  ],
  species: [["species"], ["library-species"], ["species-by-ids"]],
  background: [["backgrounds"], ["library-backgrounds"], ["backgrounds-by-ids"]],
  class: [["custom_classes"], ["system_classes"]],
};

function pictureOf(entry: FocalQueueEntry): string {
  if (entry.imageUrl === null) throw new Error("This entry has no picture");
  return entry.imageUrl;
}

/** Marks every art row of the picture as seen by a person. */
async function stampChecked(entry: FocalQueueEntry): Promise<void> {
  const { kind } = entry;
  if (isNamedKind(kind)) {
    const { error } = await namedTable(kind)
      .update({ focal_point_checked_at: new Date().toISOString() })
      .in("id", entry.keys);
    if (error) throw error;
    return;
  }
  const imageUrl = pictureOf(entry);
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
  const { kind } = entry;
  if (isNamedKind(kind)) {
    // The picture is written too, so rows of one name that disagreed on it
    // (the queue shows the first) all end up on the picture the point is for.
    const { error } = await namedTable(kind)
      .update({ focal_point: point, image_url: pictureOf(entry) })
      .in("id", entry.keys);
    if (error) throw error;
    return;
  }
  if (kind === "item") {
    await writeItemFocalPoint(pictureOf(entry), point);
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
   * and catalogue queries do refetch, lazily, because other screens read them.
   */
  function applySaved(entry: FocalQueueEntry, point: FocalPointValue | null) {
    patchQueue(entry, (row) => ({ ...row, checkedAt: new Date().toISOString(), focalPoint: point === null ? row.focalPoint : point }));
  }

  function patchQueue(entry: FocalQueueEntry, change: (row: FocalQueueEntry) => FocalQueueEntry) {
    queryClient.setQueryData<FocalQueueEntry[]>([FOCAL_QUEUE_QUERY_KEY, entry.kind], (current) => {
      if (!current) return current;
      return sortFocalQueue(current.map((row) => (row.id === entry.id ? change(row) : row)));
    });
    for (const queryKey of INVALIDATE[entry.kind]) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }

  const setFocalPoint = useMutation({
    mutationFn: async ({ entry, point }: { entry: FocalQueueEntry; point: FocalPointValue }) => {
      await writeFocalPoint(entry, point);
      await stampChecked(entry);
    },
    onSuccess: (_data, { entry, point }) => applySaved(entry, point),
  });

  const acceptFocalPoint = useMutation({
    mutationFn: ({ entry }: { entry: FocalQueueEntry }) => stampChecked(entry),
    onSuccess: (_data, { entry }) => applySaved(entry, null),
  });

  /**
   * Adds or replaces the picture of a named entry (every edition row of the
   * name). The old file is left in its bucket: the publish tool never deletes,
   * and a DM's copy of the row may still point at it. The point is cleared and
   * the entry unchecked, so the viewer stays on it, ready for a click.
   */
  const replacePicture = useMutation({
    mutationFn: async ({ entry, file }: { entry: FocalQueueEntry; file: File }) => {
      const { kind } = entry;
      if (!isNamedKind(kind)) throw new Error("Only species, backgrounds and classes take a new picture here");
      const user = getCurrentUser();
      if (!user) throw new Error("Not signed in");
      const webp = await toWebP(file);
      const url = await uploadWithVariants({
        bucket: NAMED_CONFIG[kind].bucket,
        blob: webp,
        userId: user.id,
        folderPrefix: "srd",
      });
      if (!url) throw new Error("The upload failed");
      const { error } = await namedTable(kind)
        .update({ image_url: url, focal_point: null, focal_point_checked_at: null })
        .in("id", entry.keys);
      if (error) throw error;
      return url;
    },
    onSuccess: (url, { entry }) => {
      patchQueue(entry, (row) => ({ ...row, imageUrl: url, focalPoint: null, checkedAt: null }));
    },
  });

  const entries = computed(() => (query.data.value === undefined ? [] : query.data.value));

  return { query, entries, setFocalPoint, acceptFocalPoint, replacePicture };
}
