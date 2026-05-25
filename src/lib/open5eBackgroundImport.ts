import type { BackgroundInsert } from "@/types/background.types";

// ── Open5e v1 API shapes ──────────────────────────────────────────────────────

interface Open5eBackground {
  slug: string;
  name: string;
  desc: string;
  skill_proficiencies: string;   // Comma-separated prose, e.g. "Insight, Religion"
  tool_proficiencies: string;    // Comma-separated or "—"
  languages: string;             // Comma-separated or "—" / "Two of your choice"
  equipment: string;             // Prose list + closing gp amount
  feature: string;
  feature_desc: string;
  suggested_characteristics: string;
  document__slug: string;
  document__title: string;
  document__url: string;
}

interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

// ── Pagination fetch ──────────────────────────────────────────────────────────

async function fetchAll<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  const sep = baseUrl.includes("?") ? "&" : "?";
  let url: string | null = `${baseUrl}${sep}limit=500&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json: Open5eListResponse<T> = await res.json();
    results.push(...json.results);
    url = json.next;
  }
  return results;
}

// ── Document list (shared endpoint) ───────────────────────────────────────────

export interface Open5eDocument {
  slug: string;
  title: string;
}

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const docs = await fetchAll<Open5eDocument>("https://api.open5e.com/v1/documents/");
  return docs.slice().sort((a, b) => a.title.localeCompare(b.title));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Open5e ships skill / tool / language proficiencies as a single
 * comma-separated string (plus occasional prose like "Two of your
 * choice"). Split those into arrays, trim, and drop em-dashes that the
 * API uses to mean "none".
 */
function splitProficiencies(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "none") {
    return [];
  }
  return trimmed
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapBackground(b: Open5eBackground): BackgroundInsert {
  return {
    name: b.name,
    description: b.desc?.trim() || null,
    skill_proficiencies: splitProficiencies(b.skill_proficiencies),
    tool_proficiencies: splitProficiencies(b.tool_proficiencies),
    languages: splitProficiencies(b.languages),
    equipment: b.equipment?.trim() || null,
    feature_name: b.feature?.trim() || null,
    feature_description: b.feature_desc?.trim() || null,
    feat_grant_name: null,
    feat_grant_description: null,
    suggested_characteristics: b.suggested_characteristics?.trim() || null,
    tags: [],
    source: b.document__slug ?? null,
    source_title: b.document__title ?? null,
    source_url: b.document__url ?? null,
    open5e_import: true,
    image_url: null,
    focal_point: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch backgrounds from one or more Open5e documents. No argument =
 * cross-document corpus (42 entries as of 2026-04); otherwise a filtered
 * fetch by `document__slug`. Deduplicates by name so a cross-document
 * duplicate doesn't collide downstream.
 */
export async function fetchBackgrounds(sourceSlugs?: string[]): Promise<BackgroundInsert[]> {
  let raw: Open5eBackground[];

  if (sourceSlugs && sourceSlugs.length > 0) {
    const fetches = await Promise.all(
      sourceSlugs.map((slug) =>
        fetchAll<Open5eBackground>(`https://api.open5e.com/v1/backgrounds/?document__slug=${slug}`),
      ),
    );
    raw = fetches.flat();
  } else {
    raw = await fetchAll<Open5eBackground>("https://api.open5e.com/v1/backgrounds/");
  }

  const seen = new Set<string>();
  return raw
    .map(mapBackground)
    .filter((b) => {
      if (seen.has(b.name)) return false;
      seen.add(b.name);
      return true;
    });
}
