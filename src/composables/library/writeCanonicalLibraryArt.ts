import { supabase, getCurrentUser } from "@/lib/supabase";
import { planCanonicalArtWrite } from "@/lib/library/canonicalArt";

export interface FocalPoint {
  x: number;
  y: number;
}

/** The art fields an edit may carry. Spells never send cutout_url. */
export type CanonicalArtField = "image_url" | "cutout_url" | "portrait_focal_point";

export interface CanonicalArtPatch {
  image_url?: string | null;
  cutout_url?: string | null;
  portrait_focal_point?: FocalPoint | null;
}

export type CanonicalArtEdit = CanonicalArtPatch & { entry_id: string };

export interface CanonicalArtConfig {
  canonicalTable: "library_monster_art_canonical" | "library_spell_art_canonical";
  libraryTable: "library_monsters" | "library_spells";
  ownTable: "library_monster_art" | "library_spell_art";
  /** The library row's focal point column: it is named differently per table. */
  libraryFocalColumn: "portrait_focal_point" | "image_focal_point";
  /** Whether the own-override table has a cutout_url column (monsters do, spells do not). */
  ownHasCutout: boolean;
}

export const MONSTER_CANONICAL_ART: CanonicalArtConfig = {
  canonicalTable: "library_monster_art_canonical",
  libraryTable: "library_monsters",
  ownTable: "library_monster_art",
  libraryFocalColumn: "portrait_focal_point",
  ownHasCutout: true,
};

export const SPELL_CANONICAL_ART: CanonicalArtConfig = {
  canonicalTable: "library_spell_art_canonical",
  libraryTable: "library_spells",
  ownTable: "library_spell_art",
  libraryFocalColumn: "image_focal_point",
  ownHasCutout: false,
};

/**
 * One chainable query surface for the three tables the writer touches. The
 * typed client resolves `from()` per table literal, so a config-driven name
 * cannot reach it directly; this structural view is the single cast, and every
 * column used below exists on all of the tables it is applied to.
 */
interface Filterable<T> extends PromiseLike<{ data: T; error: Error | null }> {
  eq(column: string, value: string): Filterable<T>;
  in(column: string, values: string[]): Filterable<T>;
  is(column: string, value: null): Filterable<T>;
}
interface ArtTable {
  select<T>(columns: string): Filterable<T[]>;
  update(values: Record<string, unknown>): Filterable<null>;
  insert(rows: Record<string, unknown>[]): PromiseLike<{ error: Error | null }>;
  delete(): Filterable<null>;
}
function table(name: string): ArtTable {
  return supabase.from(name as "library_monsters") as unknown as ArtTable;
}

async function run<T>(query: PromiseLike<{ data: T; error: Error | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * An app admin's edit is the library's own art, not a personal override: it is
 * written to the canonical table (and the library row) for every id showing the
 * same picture, so the twins of a shared image change together. A spell without
 * a canonical row of its own shows its namesake's picture, held in the library
 * row's image_url, which is why shared rows are found there and not only among
 * canonical rows. Only the fields the edit carries are written; a field it did
 * not mention is never nulled.
 */
export async function writeCanonicalLibraryArt(config: CanonicalArtConfig, entry: CanonicalArtEdit): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { canonicalTable, libraryTable, ownTable, libraryFocalColumn } = config;

  const [current] = await run(
    table(libraryTable).select<{ image_url: string | null }>("image_url").eq("id", entry.entry_id),
  );
  const currentImageUrl = current?.image_url ?? null;

  let libraryRows: { id: string; image_url: string | null }[] = [];
  let canonicalRows: { entry_id: string; image_url: string | null }[] = [];
  if (currentImageUrl !== null) {
    [libraryRows, canonicalRows] = await Promise.all([
      run(table(libraryTable).select<{ id: string; image_url: string | null }>("id, image_url").eq("image_url", currentImageUrl)),
      run(
        table(canonicalTable)
          .select<{ entry_id: string; image_url: string | null }>("entry_id, image_url")
          .eq("image_url", currentImageUrl),
      ),
    ]);
  }

  const { entry_id, ...edit } = entry;
  const { ids, fields } = planCanonicalArtWrite<CanonicalArtField>({
    entryId: entry_id,
    edit,
    currentImageUrl,
    libraryRows,
    canonicalRows,
  });
  if (!fields.length) return;

  const values: CanonicalArtPatch = {};
  for (const field of fields) Object.assign(values, { [field]: edit[field] });

  const existing = await run(table(canonicalTable).select<{ entry_id: string }>("entry_id").in("entry_id", ids));
  const existingIds = new Set(existing.map((row) => row.entry_id));
  const existingList = ids.filter((id) => existingIds.has(id));
  const missingList = ids.filter((id) => !existingIds.has(id));

  if (existingList.length) {
    await run(table(canonicalTable).update({ ...values }).in("entry_id", existingList));
  }
  if (missingList.length) {
    // A new canonical row carries the picture the id already shows, so editing
    // only a focal point does not leave it without its image.
    const { error } = await table(canonicalTable).insert(
      missingList.map((id) => ({ entry_id: id, image_url: currentImageUrl, ...values })),
    );
    if (error) throw error;
  }

  // Library rows have no cutout column, so only the picture and focal point travel.
  const libraryValues: Record<string, unknown> = {};
  if (fields.includes("image_url")) libraryValues.image_url = values.image_url;
  if (fields.includes("portrait_focal_point")) libraryValues[libraryFocalColumn] = values.portrait_focal_point;
  if (Object.keys(libraryValues).length) {
    await run(table(libraryTable).update(libraryValues).in("id", ids));
  }

  // The admin's own override wins over canonical per field, so a leftover
  // personal value would hide the library version just set. Clear the edited
  // fields on it, then drop any override row that no longer holds anything.
  const cleared: Record<string, null> = {};
  for (const field of fields) cleared[field] = null;
  await run(table(ownTable).update(cleared).eq("user_id", user.id).in("entry_id", ids));
  let drop = table(ownTable)
    .delete()
    .eq("user_id", user.id)
    .in("entry_id", ids)
    .is("image_url", null)
    .is("portrait_focal_point", null);
  if (config.ownHasCutout) drop = drop.is("cutout_url", null);
  await run(drop);
}
