// Grimoire catalogue adapter.
//
// Searches the curated CC0 / CC-BY audio we host ourselves (`sound_library`),
// rather than a third party's API. That difference is the point of it: no rate
// limit, no terms that can change under us, no commercial-use question, and a
// licence plus credit line recorded per row at curation time instead of parsed
// out of a search response.
//
// It is the default tab because it is the only source where a DM can add
// something without leaving our own content, and because it is free on every
// tier — catalogue rows do not count against the sound cap.

import { supabase } from "@/lib/supabase";
import { likeLiteral, orFilterValue } from "@/lib/postgrestFilter";
import type { SoundLibraryEntry } from "@/types/sound.types";
import type {
  SoundProvider,
  ProviderHit,
  ProviderSearchParams,
  ProviderSearchResult,
} from "./types";

export const LIBRARY_PROVIDER_ID = "grimoire";

/** Matches the browser's page size; the catalogue is small enough to page simply. */
const PAGE_SIZE = 20;

/**
 * The `or=` filter for a DM-typed search over title, collection and tags.
 * Every value is quoted (`orFilterValue`), so `,` `.` `:` `(` `)` and `"` in the
 * text are data rather than PostgREST syntax: "drip." or "door: creak" used to
 * make the whole request a 400 when only `,` and the parentheses were stripped.
 * `likeLiteral` keeps a typed `%` or `_` from acting as a wildcard, and the tag
 * is one quoted array element, so a tag with spaces matches as written.
 */
export function librarySearchFilter(term: string): string {
  const like = orFilterValue(`%${likeLiteral(term)}%`);
  const tag = orFilterValue(`{"${term.replace(/["\\]/g, "\\$&")}"}`);
  return `title.ilike.${like},collection.ilike.${like},tags.cs.${tag}`;
}

function toHit(row: SoundLibraryEntry): ProviderHit {
  return {
    id: row.id,
    providerId: LIBRARY_PROVIDER_ID,
    name: row.title,
    author: row.author,
    // The ingest only admits CC0 and CC-BY, and records which per row. The
    // credit line's presence is the obligation, so it decides the label rather
    // than string-matching the licence name.
    license: row.attribution === null ? "public-domain" : "attribution",
    audioUrl: row.file_url,
    // 0 is `ProviderHit`'s documented "not reported", which is the honest
    // answer for a row whose duration could not be read at ingest time.
    duration: row.duration_seconds === null ? 0 : row.duration_seconds,
    tags: row.tags,
    pageUrl: row.source_page,
    attribution: row.attribution,
    attributionUrl: row.attribution === null ? null : row.source_page,
    isLoopable: row.is_loopable,
    libraryId: row.id,
    category: row.category,
  };
}

export const libraryProvider: SoundProvider = {
  id: LIBRARY_PROVIDER_ID,
  sourceType: "library",
  label: "Grimoire Sounds",
  attributionNote:
    "Creative Commons audio we host ourselves. Free on every tier, and it does not count against your sound limit.",
  // One character is worth searching here: the catalogue is ours and small, so
  // there is no upstream cost to a broad query the way there is with an API.
  minQueryLength: 1,

  async search({ query, page, filters }: ProviderSearchParams): Promise<ProviderSearchResult> {
    const from = (page - 1) * PAGE_SIZE;
    const term = query.trim();

    let request = supabase
      .from("sound_library")
      .select("*", { count: "exact" })
      .range(from, from + PAGE_SIZE - 1);

    if (filters.sort === "shortest") {
      request = request.order("duration_seconds", { ascending: true, nullsFirst: false });
    } else if (filters.sort === "longest") {
      request = request.order("duration_seconds", { ascending: false, nullsFirst: false });
    } else {
      // Beds before one-shots, then alphabetical: with no query to rank
      // against, "best match" is really "sensible browsing order".
      request = request.order("category", { ascending: true }).order("title", { ascending: true });
    }

    if (filters.minDuration !== null) request = request.gte("duration_seconds", filters.minDuration);
    if (filters.maxDuration !== null) request = request.lte("duration_seconds", filters.maxDuration);

    if (term !== "") {
      // Title, collection and tags all searched: a DM types "rain" thinking of
      // the grouping, "gutter" thinking of the file, and "storm" thinking of
      // the theme label. All three should find something.
      request = request.or(librarySearchFilter(term));
    }

    const { data, error, count } = await request;
    if (error) throw error;
    if (data === null) throw new Error("sound_library search returned no payload");

    const rows = data as SoundLibraryEntry[];
    return {
      hits: rows.map(toHit),
      page,
      hasNext: count === null ? rows.length === PAGE_SIZE : from + rows.length < count,
      total: count,
    };
  },
};
