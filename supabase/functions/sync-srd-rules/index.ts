import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Open5e v1 `/v1/sections/` — 2014 SRD 5.1 prose sections.
//
// Earlier this function pulled from v2 `/v2/rulesets/` (the 2024 / 5.5e
// SRD), but the rest of the app (monsters, backgrounds, conditions,
// spells, items …) all consumes v1 endpoints, so the Compendium content
// was the odd one out. To keep the edition consistent across the whole
// app, this function now syncs v1 sections only and explicitly cleans up
// the old `doc_slug='srd-2024'` rows on each run so the table doesn't
// carry stale 5.5e content.
//
// When we eventually add explicit v2 / 5.5e support across the rest of
// the app, this function should grow back the v2 rulesets fetch (or
// move v2 to its own function) — see #142.
//
// Sections are a flat list with a free-text `parent` name. We slugify
// each section's name to look up parents and build the tree client-side.

const OPEN5E_SECTIONS_BASE = "https://api.open5e.com/v1/sections/";
const DOC_SLUG = "srd-5.1";
const STALE_DOC_SLUGS = ["srd-2024"]; // Removed on each run.
const BATCH = 100;

interface Open5eV1Section {
  slug: string;
  name: string;
  desc: string;
  parent: string;  // Free-text parent name, e.g. "Combat", "" for root
}

interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

interface Row {
  slug: string;
  name: string;
  content: string;
  parent_slug: string | null;
  doc_slug: string;
}

async function fetchAll<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${baseUrl}?limit=100&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json: Open5eListResponse<T> = await res.json();
    results.push(...json.results);
    url = json.next;
  }
  return results;
}

/**
 * Build tree-ready rows from the flat sections list:
 *   1. Prefix every slug with `srd5_` so the namespace stays clean and
 *      so old v2 rows (which used `srd-2024_*` keys) couldn't accidentally
 *      collide on a re-import.
 *   2. Look up each row's parent by lowercased name.
 *   3. If a section's parent isn't in the result set, it becomes a
 *      top-level node (`parent_slug: null`).
 */
function buildRows(sections: Open5eV1Section[]): Row[] {
  const PREFIX = "srd5_";
  const namesToSlugs = new Map<string, string>(
    sections.map((s) => [s.name.toLowerCase(), `${PREFIX}${s.slug}`]),
  );
  return sections.map((s) => {
    const parentName = (s.parent ?? "").toLowerCase().trim();
    const parentSlug = parentName ? (namesToSlugs.get(parentName) ?? null) : null;
    return {
      slug:        `${PREFIX}${s.slug}`,
      name:        s.name,
      content:     s.desc ?? "",
      parent_slug: parentSlug,
      doc_slug:    DOC_SLUG,
    };
  });
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const sections = await fetchAll<Open5eV1Section>(OPEN5E_SECTIONS_BASE);
    const rows: Row[] = buildRows(sections);

    // Remove stale rows from the previous v2 sync before upserting fresh
    // v1 data. Idempotent: if no v2 rows exist (already migrated) the
    // delete is a no-op.
    const { error: deleteError, count: deletedCount } = await supabase
      .from("srd_rules")
      .delete({ count: "exact" })
      .in("doc_slug", STALE_DOC_SLUGS);
    if (deleteError) throw deleteError;

    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from("srd_rules")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "slug" });
      if (error) throw error;
      upserted += rows.slice(i, i + BATCH).length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        synced: upserted,
        deleted_stale: deletedCount ?? 0,
        doc_slug: DOC_SLUG,
        sections_fetched: sections.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-srd-rules error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
