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
  // A bond, not kin: parents, spouses and siblings are kin_links (#1083)
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
export const MAX_SUGGESTIONS = 6;
export const MAX_SET_ASIDE = 6;

export interface NpcSuggestion {
  kind: "npc";
  target_name: string;
  relationship_type: SuggestedRelationshipType;
  notes: string;
}

/**
 * The roles a faction membership can hold. Mirrors `NPC_FACTION_ROLES` in
 * src/types/faction.types.ts, which edge code cannot import;
 * src/types/factionRoleMirror.test.ts holds the two equal. The membership's role
 * picker offers only these, so a role outside the list would be saved and then
 * show blank.
 */
export const SUGGESTED_FACTION_ROLES = [
  "Leader",
  "Head of house",
  "Officer",
  "Enforcer",
  "Member",
  "Initiate",
  "Envoy",
  "Patron",
  "Associate",
  "Supplier",
  "Sympathiser",
  "Supplicant",
  "Agent",
  "Informant",
  "Secret member",
  "Infiltrator",
  "Unwitting pawn",
  "Adversary",
  "Unknown",
] as const;
export type SuggestedFactionRole = (typeof SUGGESTED_FACTION_ROLES)[number];

/** The roles that head a faction: a faction already headed is not offered a second head. */
export const HEAD_ROLES: readonly SuggestedFactionRole[] = ["Leader", "Head of house"];

export interface FactionSuggestion {
  kind: "faction";
  target_name: string;
  role: SuggestedFactionRole;
  notes: string;
}

/**
 * What the TARGET is to the source NPC, the same convention as the bonds
 * ("parent": the target is the source's parent). Mirrors `KIN_RELATIONS` in
 * src/types/kinship.types.ts, which edge code cannot import;
 * src/types/kinshipEnumMirror.test.ts holds the two equal.
 */
export const SUGGESTED_KIN_RELATIONS = ["parent", "child", "spouse", "former_spouse", "sibling", "relative"] as const;
export type SuggestedKinRelation = (typeof SUGGESTED_KIN_RELATIONS)[number];

export interface KinSuggestion {
  kind: "kin";
  target_name: string;
  target_type: "npc" | "pc";
  relation: SuggestedKinRelation;
  /** Which parent the target is, only when relation is "parent". */
  parent_role: "father" | "mother" | null;
  /** The evidence, in the model's words. */
  notes: string;
}

export type RelationshipSuggestion = NpcSuggestion | FactionSuggestion | KinSuggestion;

/** A kin claim the app refused to offer, with the reason in plain words. */
export interface SetAsideKin {
  target_name: string;
  relation: SuggestedKinRelation;
  reason: string;
}

export interface SanitizedSuggestions {
  suggestions: RelationshipSuggestion[];
  setAside: SetAsideKin[];
}

export interface SuggestionContext {
  /** Candidate NPC names the model was shown. */
  npcNames: string[];
  /** Candidate faction names the model was shown. */
  factionNames: string[];
  /** NPCs the source already has a tie to (either direction). */
  existingNpcNames: string[];
  /** Factions the source already belongs to. */
  existingFactionNames?: string[];
  /** Factions that already have a Leader or Head of house. */
  headedFactionNames?: string[];
  sourceName: string;
  /** Campaign PCs the model was shown as kin candidates. */
  pcNames?: string[];
  /** People a kin link already joins to the source, by kind. */
  existingKinNpcNames?: string[];
  existingKinPcNames?: string[];
  sourceBornYear?: number | null;
  /** Birth years by `npc:<lower-case name>` / `pc:<lower-case name>`. */
  bornYears?: Record<string, number>;
  /** People who are already the source's siblings through shared parents, key -> the shared parent's name. */
  impliedSiblings?: Record<string, string>;
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

/** The listed role, matched without regard to case; anything else is the loosest tie, Associate. */
function factionRole(v: unknown): SuggestedFactionRole {
  const wanted = typeof v === "string" ? v.trim().toLowerCase() : "";
  return SUGGESTED_FACTION_ROLES.find((r) => r.toLowerCase() === wanted) ?? "Associate";
}

function isKinRelation(v: unknown): v is SuggestedKinRelation {
  return typeof v === "string" && (SUGGESTED_KIN_RELATIONS as readonly string[]).includes(v);
}

const SMALL_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function yearsPhrase(n: number): string {
  const word = n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n);
  return `${word} ${n === 1 ? "year" : "years"}`;
}

/** Null when the birth years allow it; else why a parent cannot be that child's parent. */
function parentChildReason(parent: { name: string; born?: number }, child: { name: string; born?: number }): string | null {
  if (parent.born === undefined || child.born === undefined || parent.born < child.born) return null;
  if (parent.born === child.born) return `${parent.name} and ${child.name} were born in the same year`;
  return `${parent.name} was born ${yearsPhrase(parent.born - child.born)} after ${child.name}`;
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
 * back in the candidate's own casing. A kin claim the birth years or the
 * existing family contradict comes back in `setAside` with its reason.
 */
export function sanitizeSuggestions(raw: unknown, ctx: SuggestionContext): SanitizedSuggestions {
  const list: unknown = isRecord(raw) ? raw.suggestions : raw;
  const out: RelationshipSuggestion[] = [];
  const setAside: SetAsideKin[] = [];
  if (!Array.isArray(list)) return { suggestions: out, setAside };

  const npcs = lookup(ctx.npcNames);
  const pcs = lookup(ctx.pcNames ?? []);
  const factions = lookup(ctx.factionNames);
  const lower = (names: string[] | undefined) => new Set((names ?? []).map((n) => n.trim().toLowerCase()));
  const existingNpcs = lower(ctx.existingNpcNames);
  const existingFactions = lower(ctx.existingFactionNames);
  const headedFactions = lower(ctx.headedFactionNames);
  const kinNpcs = lower(ctx.existingKinNpcNames);
  const kinPcs = lower(ctx.existingKinPcNames);
  const source = ctx.sourceName.trim().toLowerCase();

  const seen = new Set<string>();

  for (const item of list) {
    if (!isRecord(item)) continue;
    if (typeof item.target_name !== "string") continue;
    const key = item.target_name.trim().toLowerCase();
    if (!key) continue;

    const notes = clean(item.notes, MAX_NOTES_CHARS);

    if (item.kind === "kin") {
      if (!isKinRelation(item.relation)) continue;
      // The declared type is a hint: a name found only in the other list still resolves.
      let type: "npc" | "pc" = item.target_type === "pc" ? "pc" : "npc";
      let canonical = (type === "pc" ? pcs : npcs).get(key);
      if (!canonical) {
        type = type === "pc" ? "npc" : "pc";
        canonical = (type === "pc" ? pcs : npcs).get(key);
      }
      if (!canonical) continue;
      if (type === "npc" && key === source) continue;
      if ((type === "pc" ? kinPcs : kinNpcs).has(key)) continue;
      const dedupe = `kin:${type}:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const relation = item.relation;
      const personKey = `${type}:${key}`;
      const targetBorn = ctx.bornYears?.[personKey];
      const sourceBorn = ctx.sourceBornYear ?? undefined;
      let reason: string | null = null;
      if (relation === "parent") {
        reason = parentChildReason({ name: canonical, born: targetBorn }, { name: ctx.sourceName, born: sourceBorn });
      } else if (relation === "child") {
        reason = parentChildReason({ name: ctx.sourceName, born: sourceBorn }, { name: canonical, born: targetBorn });
      } else if (relation === "sibling") {
        const through = ctx.impliedSiblings?.[personKey];
        if (through) reason = `already siblings through ${through}`;
      }
      if (reason) {
        if (setAside.length < MAX_SET_ASIDE) setAside.push({ target_name: canonical, relation, reason });
        continue;
      }
      out.push({
        kind: "kin",
        target_name: canonical,
        target_type: type,
        relation,
        parent_role: relation === "parent" && (item.parent_role === "father" || item.parent_role === "mother") ? item.parent_role : null,
        notes,
      });
    } else if (item.kind === "npc") {
      if (key === source) continue;
      const canonical = npcs.get(key);
      if (!canonical || existingNpcs.has(key)) continue;
      if (!isRelationshipType(item.relationship_type)) continue;
      const dedupe = `npc:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ kind: "npc", target_name: canonical, relationship_type: item.relationship_type, notes });
    } else if (item.kind === "faction") {
      if (key === source) continue;
      const canonical = factions.get(key);
      if (!canonical || existingFactions.has(key)) continue;
      const role = factionRole(item.role);
      if (HEAD_ROLES.includes(role) && headedFactions.has(key)) continue;
      const dedupe = `faction:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ kind: "faction", target_name: canonical, role, notes });
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return { suggestions: out, setAside };
}
