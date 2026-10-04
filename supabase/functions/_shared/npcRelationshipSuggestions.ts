/**
 * Pure helpers for the NPC relationship suggester (#910).
 *
 * The model proposes ties between the NPC on screen and the rest of the
 * campaign. Its output is untrusted: names it invented, ties that already
 * exist, relationship types outside the enum and duplicates are all dropped
 * here, so the client only ever sees suggestions it can map back to a real row.
 *
 * `NPC_RELATIONSHIP_TYPES` is the one list of valid types. The client's
 * `NpcRelationshipType` (src/types/npc.types.ts) is derived from it, so the two
 * cannot drift.
 */

export const NPC_RELATIONSHIP_TYPES = [
  // Familial
  "family",
  "sibling",
  "chosen_family",
  // Affinitive
  "friend",
  "ally",
  "rival",
  "enemy",
  "lover",
  // Hierarchical
  "mentor",
  "apprentice",
  "subordinate",
  "superior",
  // Acquaintance / former
  "contact",
  "former_ally",
  "former_enemy",
] as const;

export type SuggestedRelationshipType = (typeof NPC_RELATIONSHIP_TYPES)[number];

export const MAX_NOTES_CHARS = 300;
export const MAX_ROLE_CHARS = 60;
export const MAX_SUGGESTIONS = 6;

export interface NpcSuggestion {
  kind: "npc";
  target_name: string;
  relationship_type: SuggestedRelationshipType;
  notes: string;
}

export interface FactionSuggestion {
  kind: "faction";
  target_name: string;
  role: string;
  notes: string;
}

export type RelationshipSuggestion = NpcSuggestion | FactionSuggestion;

export interface SuggestionContext {
  /** Candidate NPC names the model was shown. */
  npcNames: string[];
  /** Candidate faction names the model was shown. */
  factionNames: string[];
  /** NPCs the source already has a tie to (either direction). */
  existingNpcNames: string[];
  /** Factions the source already belongs to. */
  existingFactionNames?: string[];
  sourceName: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function isRelationshipType(v: unknown): v is SuggestedRelationshipType {
  return typeof v === "string" && (NPC_RELATIONSHIP_TYPES as readonly string[]).includes(v);
}

/** Canonical casing of a candidate, keyed by lower-case name. */
function lookup(names: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (k && !m.has(k)) m.set(k, n.trim());
  }
  return m;
}

/**
 * Accepts the parsed model response (`{ suggestions: [...] }` or a bare array)
 * and returns only suggestions that name a real candidate. `target_name` comes
 * back in the candidate's own casing.
 */
export function sanitizeSuggestions(raw: unknown, ctx: SuggestionContext): RelationshipSuggestion[] {
  const list: unknown = isRecord(raw) ? raw.suggestions : raw;
  if (!Array.isArray(list)) return [];

  const npcs = lookup(ctx.npcNames);
  const factions = lookup(ctx.factionNames);
  const existingNpcs = new Set(ctx.existingNpcNames.map((n) => n.trim().toLowerCase()));
  const existingFactions = new Set((ctx.existingFactionNames ?? []).map((n) => n.trim().toLowerCase()));
  const source = ctx.sourceName.trim().toLowerCase();

  const seen = new Set<string>();
  const out: RelationshipSuggestion[] = [];

  for (const item of list) {
    if (!isRecord(item)) continue;
    if (typeof item.target_name !== "string") continue;
    const key = item.target_name.trim().toLowerCase();
    if (!key || key === source) continue;

    const notes = clean(item.notes, MAX_NOTES_CHARS);

    if (item.kind === "npc") {
      const canonical = npcs.get(key);
      if (!canonical || existingNpcs.has(key)) continue;
      if (!isRelationshipType(item.relationship_type)) continue;
      const dedupe = `npc:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ kind: "npc", target_name: canonical, relationship_type: item.relationship_type, notes });
    } else if (item.kind === "faction") {
      const canonical = factions.get(key);
      if (!canonical || existingFactions.has(key)) continue;
      const dedupe = `faction:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ kind: "faction", target_name: canonical, role: clean(item.role, MAX_ROLE_CHARS), notes });
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
