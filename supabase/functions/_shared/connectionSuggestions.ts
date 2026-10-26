/**
 * Pure helpers for the connection suggester (#910, widened by the World Web #1084).
 *
 * The model proposes ties between the thing on screen (an NPC, a character, a
 * faction, a place, a deity or an item) and the rest of the campaign. Its output
 * is untrusted: names it invented, types the catalogue does not hold for that
 * pair, ties that already exist and duplicates are all dropped here, so the
 * client only ever sees suggestions it can map back to a real row.
 *
 * The valid types are the World Web catalogue (`worldLinkCatalogue.ts`), the
 * same list the picker and the database read. A suggestion is one of three
 * shapes, by where the tie would live: a `link` (a catalogue type for the pair,
 * with its direction), a `membership` (a person in a faction, with a role) or
 * `kin` (family, with its evidence).
 */
import {
  LINK_KINDS,
  PERSON_KINDS,
  WORLD_LINK_PAIRS,
  type LinkKind,
  type LinkPair,
  type LinkTypeDef,
} from "./worldLinkCatalogue.ts";

/**
 * The bond words the NPC generator's "known associate" picker and the campaign
 * import still speak (`NpcRelationshipType` in src/types/npc.types.ts). They are
 * not what the suggester returns any more (it returns catalogue keys); they stay
 * here only because those two callers read them from this module.
 */
export const NPC_RELATIONSHIP_TYPES = [
  "chosen_family",
  "friend",
  "ally",
  "rival",
  "enemy",
  "lover",
  "mentor",
  "apprentice",
  "subordinate",
  "superior",
  "contact",
  "former_ally",
  "former_enemy",
] as const;

export type SuggestedRelationshipType = (typeof NPC_RELATIONSHIP_TYPES)[number];

export const MAX_NOTES_CHARS = 300;
export const MAX_SUGGESTIONS = 12;
export const MAX_SET_ASIDE = 6;

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

/**
 * What the TARGET is to the subject ("parent": the target is the subject's
 * parent). Mirrors `KIN_RELATIONS` in src/types/kinship.types.ts, which edge code
 * cannot import; src/types/kinshipEnumMirror.test.ts holds the two equal.
 */
export const SUGGESTED_KIN_RELATIONS = ["parent", "child", "spouse", "former_spouse", "sibling", "relative"] as const;
export type SuggestedKinRelation = (typeof SUGGESTED_KIN_RELATIONS)[number];

/** A typed link from the catalogue. `type` is the catalogue key; `subject_is_from` says which end the subject is stored as. */
export interface LinkSuggestion {
  kind: "link";
  target_kind: LinkKind;
  target_name: string;
  type: string;
  subject_is_from: boolean;
  notes: string;
}

/** A person in a faction, whichever of the two is the subject. `target_kind` is the far end's kind. */
export interface MembershipSuggestion {
  kind: "membership";
  target_kind: "faction" | "npc" | "party_member";
  target_name: string;
  role: SuggestedFactionRole;
  notes: string;
}

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

export type ConnectionSuggestion = LinkSuggestion | MembershipSuggestion | KinSuggestion;

/** A claim the app refused to offer, with the reason in plain words. */
export interface SetAsideClaim {
  target_name: string;
  /** The claim as a sentence fragment: "Pip is Wren's parent", "The Ferry Bell is kept at the Weir Chapel". */
  claim: string;
  reason: string;
}

/** A suggestion with the id of the record its `target_name` resolved to (a party member's id for a character). */
export type ResolvedSuggestion = ConnectionSuggestion & { target_id: string };

export interface SanitizedSuggestions {
  suggestions: ConnectionSuggestion[];
  setAside: SetAsideClaim[];
}

/** A link the subject already has, read from the subject's side. */
export interface ExistingLink {
  kind: LinkKind;
  name: string;
  type: string;
  /** True when the subject is the stored `from` end. */
  outward: boolean;
}

export interface SuggestionContext {
  subjectKind: LinkKind;
  sourceName: string;
  /** Candidate names the model was shown, by kind. Characters are under `party_member`. */
  candidates: Partial<Record<LinkKind, string[]>>;
  existingLinks: ExistingLink[];
  /** Far ends already joined to the subject by a membership (people if the subject is a faction, else factions). */
  existingMemberNames?: string[];
  /** Factions that already have a Leader or Head of house. */
  headedFactionNames?: string[];
  /** The subject is a faction that already has a Leader or Head of house. */
  subjectHeaded?: boolean;
  /** People a kin link already joins to the subject, by kind. */
  existingKinNpcNames?: string[];
  existingKinPcNames?: string[];
  sourceBornYear?: number | null;
  /** Birth years by `npc:<lower-case name>` / `pc:<lower-case name>`. */
  bornYears?: Record<string, number>;
  /** People who are already the subject's siblings through shared parents, key -> the shared parent's name. */
  impliedSiblings?: Record<string, string>;
  /** Items someone carries: lower-case item name -> the carrier's name. */
  itemCarriers?: Record<string, string>;
}

// ── The catalogue, read for one subject ──────────────────────────────────────

/** One link type the subject can hold towards a kind, read from the subject. */
export interface LinkOption {
  key: string;
  word: string;
  subjectIsFrom: boolean;
}

function directionsFor(pair: LinkPair, subject: LinkKind, target: LinkKind, type: LinkTypeDef): boolean[] {
  const forward = pair.from.includes(subject) && pair.to.includes(target);
  const backward = pair.from.includes(target) && pair.to.includes(subject);
  const out: boolean[] = [];
  if (forward) out.push(true);
  // A symmetric type reads the same from either end, so it is offered once; a stance is each side's own.
  if (backward && !(forward && type.symmetric) && !pair.exclusive) out.push(false);
  return out;
}

/** The link types a subject of `subject` kind can hold towards `target` kind, with their direction and wording. */
export function linkOptions(subject: LinkKind, target: LinkKind): LinkOption[] {
  const out: LinkOption[] = [];
  for (const pair of WORLD_LINK_PAIRS) {
    for (const t of pair.types) {
      for (const subjectIsFrom of directionsFor(pair, subject, target, t)) {
        out.push({ key: t.key, word: subjectIsFrom ? t.forward : t.reverse, subjectIsFrom });
      }
    }
  }
  return out;
}

/** Every kind a subject can be tied to: a link pair or a membership joins them. */
export function connectableKinds(subject: LinkKind): LinkKind[] {
  return LINK_KINDS.filter((k) => WORLD_LINK_PAIRS.some((p) =>
    (p.from.includes(subject) && p.to.includes(k)) || (p.from.includes(k) && p.to.includes(subject))));
}

/**
 * The prompt's list of what the subject may be tied to each kind by. Built from
 * the catalogue, so the model is offered exactly what the check will accept.
 */
export function typeGuide(subject: LinkKind): string {
  const lines: string[] = [];
  for (const kind of connectableKinds(subject)) {
    const isPersonFaction =
      (PERSON_KINDS.includes(subject) && kind === "faction") || (subject === "faction" && PERSON_KINDS.includes(kind));
    if (isPersonFaction) {
      lines.push(`${kind}: only a membership, with a role (kind "membership").`);
      continue;
    }
    const parts = linkOptions(subject, kind).map(
      (o) => `${o.key} (subject ${o.word} target; subject_is_from ${o.subjectIsFrom})`,
    );
    if (parts.length > 0) lines.push(`${kind}: ${parts.join("; ")}`);
  }
  return lines.join("\n");
}

// ── Cleaning ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function isLinkKind(v: unknown): v is LinkKind {
  return typeof v === "string" && (LINK_KINDS as readonly string[]).includes(v);
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
function lookup(names: string[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of names ?? []) {
    const k = n.trim().toLowerCase();
    if (k && !m.has(k)) m.set(k, n.trim());
  }
  return m;
}

const KIN_WORDS: Record<SuggestedKinRelation, string> = {
  parent: "parent",
  child: "child",
  spouse: "spouse",
  former_spouse: "former spouse",
  sibling: "sibling",
  relative: "relative",
};

/**
 * The catalogue type for this pair and the end the subject is stored as, or
 * null when the type or the direction does not exist for the pair. One possible
 * direction is implied (a stated one must agree); two must be stated.
 */
function resolveDirection(
  subject: LinkKind,
  target: LinkKind,
  key: string,
  declared: unknown,
): { def: LinkTypeDef; pair: LinkPair; subjectIsFrom: boolean } | null {
  for (const pair of WORLD_LINK_PAIRS) {
    const def = pair.types.find((t) => t.key === key);
    if (!def) continue;
    const dirs = directionsFor(pair, subject, target, def);
    if (dirs.length === 0) continue;
    if (dirs.length === 1) {
      if (typeof declared === "boolean" && declared !== dirs[0]) return null;
      return { def, pair, subjectIsFrom: dirs[0] };
    }
    if (typeof declared !== "boolean") return null;
    return { def, pair, subjectIsFrom: declared };
  }
  return null;
}

/**
 * Accepts the parsed model response (`{ suggestions: [...] }` or a bare array)
 * and returns only suggestions that name a real candidate and a type the
 * catalogue holds for the pair. `target_name` comes back in the candidate's own
 * casing. A claim the records contradict comes back in `setAside` with its
 * reason.
 */
export function sanitizeSuggestions(raw: unknown, ctx: SuggestionContext): SanitizedSuggestions {
  const list: unknown = isRecord(raw) ? raw.suggestions : raw;
  const out: ConnectionSuggestion[] = [];
  const setAside: SetAsideClaim[] = [];
  if (!Array.isArray(list)) return { suggestions: out, setAside };

  const byKind = new Map<LinkKind, Map<string, string>>(LINK_KINDS.map((k) => [k, lookup(ctx.candidates[k])]));
  const lower = (names: string[] | undefined) => new Set((names ?? []).map((n) => n.trim().toLowerCase()));
  const members = lower(ctx.existingMemberNames);
  const headedFactions = lower(ctx.headedFactionNames);
  const kinNpcs = lower(ctx.existingKinNpcNames);
  const kinPcs = lower(ctx.existingKinPcNames);
  const source = ctx.sourceName.trim().toLowerCase();
  const subject = ctx.subjectKind;
  const subjectIsPerson = PERSON_KINDS.includes(subject);
  const subjectPersonType: "npc" | "pc" = subject === "party_member" ? "pc" : "npc";

  const seen = new Set<string>();
  const aside = (target_name: string, claim: string, reason: string) => {
    if (setAside.length < MAX_SET_ASIDE) setAside.push({ target_name, claim, reason });
  };
  const isSubject = (kind: LinkKind, key: string) => kind === subject && key === source;

  for (const item of list) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!isRecord(item)) continue;
    if (typeof item.target_name !== "string") continue;
    const key = item.target_name.trim().toLowerCase();
    if (!key) continue;
    const notes = clean(item.notes, MAX_NOTES_CHARS);

    if (item.kind === "kin") {
      if (!subjectIsPerson || !isKinRelation(item.relation)) continue;
      // The declared type is a hint: a name found only in the other list still resolves.
      let type: "npc" | "pc" = item.target_type === "pc" ? "pc" : "npc";
      let canonical = byKind.get(type === "pc" ? "party_member" : "npc")?.get(key);
      if (!canonical) {
        type = type === "pc" ? "npc" : "pc";
        canonical = byKind.get(type === "pc" ? "party_member" : "npc")?.get(key);
      }
      if (!canonical) continue;
      if (type === subjectPersonType && key === source) continue;
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
        aside(canonical, `${canonical} is ${ctx.sourceName}'s ${KIN_WORDS[relation]}`, reason);
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
    } else if (item.kind === "membership") {
      // A person in a faction: the far end is a faction when the subject is a person, else a person.
      const kinds: LinkKind[] = subjectIsPerson ? ["faction"] : subject === "faction" ? [...PERSON_KINDS] : [];
      const hinted = isLinkKind(item.target_kind) ? item.target_kind : null;
      const order = hinted && kinds.includes(hinted) ? [hinted, ...kinds.filter((k) => k !== hinted)] : kinds;
      const targetKind = order.find((k) => byKind.get(k)?.has(key));
      if (!targetKind) continue;
      const canonical = byKind.get(targetKind)?.get(key);
      if (!canonical || isSubject(targetKind, key) || members.has(key)) continue;
      const role = factionRole(item.role);
      if (HEAD_ROLES.includes(role)) {
        const headed = subject === "faction" ? ctx.subjectHeaded === true : headedFactions.has(key);
        if (headed) continue;
      }
      const dedupe = `membership:${targetKind}:${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        kind: "membership",
        target_kind: targetKind === "faction" || targetKind === "npc" || targetKind === "party_member" ? targetKind : "faction",
        target_name: canonical,
        role,
        notes,
      });
    } else if (item.kind === "link") {
      if (typeof item.type !== "string") continue;
      const typeKey = item.type;
      // The declared kind is a hint: a name found only under another kind that can pair with the subject still resolves.
      const hinted = isLinkKind(item.target_kind) ? item.target_kind : null;
      const order = hinted ? [hinted, ...LINK_KINDS.filter((k) => k !== hinted)] : [...LINK_KINDS];
      let found: { kind: LinkKind; resolved: NonNullable<ReturnType<typeof resolveDirection>> } | null = null;
      for (const k of order) {
        if (!byKind.get(k)?.has(key)) continue;
        const resolved = resolveDirection(subject, k, typeKey, item.subject_is_from);
        if (resolved) {
          found = { kind: k, resolved };
          break;
        }
      }
      if (!found) continue;
      const targetKind = found.kind;
      const { def, pair, subjectIsFrom } = found.resolved;
      const canonical = byKind.get(targetKind)?.get(key);
      if (!canonical || isSubject(targetKind, key)) continue;

      const same = ctx.existingLinks.filter((l) => l.kind === targetKind && l.name.trim().toLowerCase() === key);
      // A stance is held once per side; any stance the subject already holds towards it is the answer.
      if (pair.exclusive && same.some((l) => l.outward)) continue;
      if (same.some((l) => l.type === def.key && l.outward === subjectIsFrom)) continue;
      if (def.symmetric && same.some((l) => l.type === def.key)) {
        aside(canonical, `${ctx.sourceName} is ${def.forward} ${canonical}`, `${canonical} is already ${def.forward} ${ctx.sourceName}`);
        continue;
      }

      // An item someone carries is not also kept or hidden in a place.
      if (pair.pair === "item_location" && (def.key === "kept_at" || def.key === "hidden_at")) {
        const itemName = subject === "item" ? ctx.sourceName : canonical;
        const placeName = subject === "item" ? canonical : ctx.sourceName;
        const carrier = ctx.itemCarriers?.[itemName.trim().toLowerCase()];
        if (carrier) {
          aside(canonical, `${itemName} is ${def.forward} ${placeName}`, `${carrier} carries it`);
          continue;
        }
      }

      const dedupe = `link:${targetKind}:${key}:${def.key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ kind: "link", target_kind: targetKind, target_name: canonical, type: def.key, subject_is_from: subjectIsFrom, notes });
    }
  }
  return { suggestions: out, setAside };
}

/**
 * Attaches the id of each suggestion's target, from the candidates the model was
 * shown (`ids[kind][lower-case name]`), so the client writes the tie without a
 * name lookup of its own. A suggestion whose target has no id is dropped.
 */
export function withTargetIds(
  suggestions: ConnectionSuggestion[],
  ids: Partial<Record<LinkKind, Record<string, string>>>,
): ResolvedSuggestion[] {
  const out: ResolvedSuggestion[] = [];
  for (const s of suggestions) {
    const kind: LinkKind = s.kind === "kin" ? (s.target_type === "pc" ? "party_member" : "npc") : s.target_kind;
    const id = ids[kind]?.[s.target_name.trim().toLowerCase()];
    if (id) out.push({ ...s, target_id: id });
  }
  return out;
}
