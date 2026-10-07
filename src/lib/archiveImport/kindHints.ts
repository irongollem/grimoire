/**
 * Guessing what a page is. Generic semantics first, small extensible hint
 * tables for vendor wording (see `sourceHtml.ts`: never a per-vendor branch).
 * A hint that matches nothing degrades to `note`; the DM settles every kind in
 * review, so a wrong guess costs a click, not data.
 */
import { normalizeEntityName } from "@/lib/documentImport/entityName";
import { frontmatterList, frontmatterString } from "./frontmatter";
import type { ArchivePageKind, FrontmatterValue } from "./types";

type GuessableKind = Exclude<ArchivePageKind, "skip">;

/**
 * Words (singular, lower case; a trailing "s" is tolerated) that name a kind,
 * used for frontmatter values, World Anvil templates, tags and folder names
 * alike. Extend when an export is measured.
 */
export const KIND_HINTS: Readonly<Record<GuessableKind, readonly string[]>> = {
  npc: ["npc", "non player character", "character", "person", "people", "persona"],
  location: ["location", "place", "settlement", "geography", "city", "town", "village", "region", "country", "continent", "building", "landmark", "dungeon", "site"],
  faction: ["faction", "organization", "organisation", "guild", "order", "religion", "government"],
  quest: ["quest", "adventure", "plot", "mission", "campaign arc"],
  item: ["item", "artifact", "artefact", "treasure", "object", "equipment", "weapon", "relic"],
  note: ["note", "session", "journal", "lore", "handout"],
};

/** Our own export's `type` values that are not in the hint table. */
const PLAYER_CHARACTER_WORDS = new Set(["party member", "party", "pc", "player character", "player"]);

/** Frontmatter keys that may say what a page is, strongest first. */
export const KIND_FRONTMATTER_KEYS: readonly string[] = ["type", "kind", "category", "template", "class", "entityclass", "entity type"];

function words(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function singular(word: string): string {
  if (word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** The kind a single word or phrase names, or null. Matches the whole phrase, never a substring. */
export function kindForWord(value: string): ArchivePageKind | null {
  const w = words(value);
  if (!w) return null;
  if (PLAYER_CHARACTER_WORDS.has(w) || PLAYER_CHARACTER_WORDS.has(singular(w))) return "skip";
  const candidates = new Set([w, singular(w)]);
  for (const [kind, list] of Object.entries(KIND_HINTS) as [GuessableKind, readonly string[]][]) {
    if (list.some((hint) => candidates.has(hint))) return kind;
  }
  return null;
}

export interface KindGuess {
  kind: ArchivePageKind;
  reason: string;
}

export interface KindEvidence {
  frontmatter: Record<string, FrontmatterValue>;
  /** World Anvil article template/class for this page, when a JSON article matched it. */
  templateHint?: string | null;
  tags: string[];
  folders: string[];
}

export function guessKind(evidence: KindEvidence): KindGuess {
  const { frontmatter } = evidence;
  const lowerKeys = new Map(Object.keys(frontmatter).map((k) => [k.toLowerCase().replace(/[_-]+/g, " "), k]));

  // 1. Our own export states its type outright.
  const ownType = frontmatterString(frontmatter.type);
  if (ownType && typeof frontmatter.grimoire_id === "string") {
    const kind = kindForWord(ownType);
    if (kind === "skip") return { kind, reason: "player characters are not imported" };
    if (kind) return { kind, reason: `Grimoire export: ${ownType}` };
  }

  // 2. Any frontmatter field that names a kind.
  for (const key of KIND_FRONTMATTER_KEYS) {
    const actual = lowerKeys.get(key);
    if (!actual) continue;
    const value = frontmatterString(frontmatter[actual]);
    const kind = value ? kindForWord(value) : null;
    if (kind === "skip") return { kind, reason: "player characters are not imported" };
    if (kind) return { kind, reason: `frontmatter ${actual}: ${value}` };
  }

  // 3. A World Anvil article template, joined from its JSON.
  if (evidence.templateHint) {
    const kind = kindForWord(evidence.templateHint);
    if (kind && kind !== "skip") return { kind, reason: `World Anvil template: ${evidence.templateHint}` };
  }

  // 4. Tags (`npc`, `world/location`, `#faction`).
  for (const tag of evidence.tags) {
    for (const segment of tag.replace(/^#/, "").split("/")) {
      const kind = kindForWord(segment);
      if (kind && kind !== "skip") return { kind, reason: `tag: #${tag.replace(/^#/, "")}` };
    }
  }

  // 5. Folders, nearest first: NPCs/Waterdeep/Bob is an NPC, not a place.
  for (const folder of [...evidence.folders].reverse()) {
    const kind = kindForWord(folder);
    if (kind && kind !== "skip") return { kind, reason: `folder: ${folder}` };
  }

  return { kind: "note", reason: "no kind hint found" };
}

/** Frontmatter `tags` and `tag`, hash-stripped, deduped. */
export function tagsFromFrontmatter(frontmatter: Record<string, FrontmatterValue>): string[] {
  const out = new Set<string>();
  for (const key of ["tags", "tag"]) {
    for (const t of frontmatterList(frontmatter[key])) {
      // A bare "a b" in Obsidian's legacy `tags: a b` form is two tags.
      for (const part of t.split(/\s+/)) {
        const clean = part.replace(/^#/, "").trim();
        if (clean) out.add(clean);
      }
    }
  }
  return [...out];
}

/** Normalised lookup key for a World Anvil article title or slug. */
export function hintKey(value: string): string | null {
  return normalizeEntityName(value);
}
