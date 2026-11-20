/**
 * The check on the canon helpers' answers (#1226 story 2, frame 13): "Draft from a pitch" for the premise and
 * "Suggest truths" for the truths. The model proposes; this file decides what survives, so the rules live in code and
 * not in a prompt a model may forget. Pure (no Deno-only imports), so the browser imports it as
 * `@edge-shared/canonSuggestions.ts`.
 *
 *  - a premise proposal is one of pitch, theme, table, voice, look. Never a line or a veil: those are agreed with the
 *    players at the table, so a proposal of either kind is refused here whatever the prompt said;
 *  - a truth carries a knowledge mark; "some" must name who knows it, and every name is matched back (case
 *    insensitively) to a real person or faction of the campaign. An unknown name never becomes a tie, and a "some"
 *    truth left with nobody is set aside rather than offered as a truth nobody knows.
 */
import { KNOWLEDGE_MARKS, PREMISE_KINDS, type KnowledgeMark, type PremiseKind, LORE_KINDS, type LoreKind } from "../../../src/types/canon.types.ts";

/** The kinds the model may propose: every premise kind except the two the table agrees on itself. */
export const SUGGESTED_PREMISE_KINDS = PREMISE_KINDS.filter(
  (k): k is Exclude<PremiseKind, "line" | "veil"> => k !== "line" && k !== "veil",
);
export type SuggestedPremiseKind = (typeof SUGGESTED_PREMISE_KINDS)[number];

/** A kind that holds one entry: a second proposal of it in one answer is dropped. */
export const SINGLE_PREMISE_KINDS: readonly SuggestedPremiseKind[] = ["pitch", "voice", "look"];

export const MAX_PREMISE_SUGGESTIONS = 8;
export const MAX_TRUTH_SUGGESTIONS = 8;
/** A one-line entry (theme, table note, truth). */
export const MAX_LINE_CHARS = 300;
/** A paragraph entry (pitch, voice, look). */
export const MAX_PARAGRAPH_CHARS = 1500;
export const MAX_KNOWERS = 6;

export const KNOWER_KIND_VALUES = ["npc", "party_member", "faction"] as const;
export type KnowerKind = (typeof KNOWER_KIND_VALUES)[number];

export interface KnowerCandidate {
  kind: KnowerKind;
  id: string;
  name: string;
}

export interface PremiseSuggestion {
  kind: SuggestedPremiseKind;
  text: string;
}

export interface TruthSuggestion {
  title: string;
  knowledge: KnowledgeMark;
  /** Resolved to real records; empty unless `knowledge` is "some". */
  knowers: KnowerCandidate[];
}

export interface CanonSetAside {
  claim: string;
  reason: string;
}

export interface ExistingPremise {
  kind: string | null;
  text: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/[ \t]+/g, " ");
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function listOf(parsed: unknown, key: string): unknown[] {
  return isRecord(parsed) && Array.isArray(parsed[key]) ? parsed[key] : [];
}

const isSuggestedKind = (v: unknown): v is SuggestedPremiseKind =>
  typeof v === "string" && (SUGGESTED_PREMISE_KINDS as readonly string[]).includes(v);

export function sanitizePremise(
  parsed: unknown,
  existing: readonly ExistingPremise[],
): { suggestions: PremiseSuggestion[]; setAside: CanonSetAside[] } {
  const suggestions: PremiseSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  const seen = new Set(existing.map((e) => `${e.kind}|${norm(e.text)}`));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_PREMISE_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const kind = raw.kind;
    const text = clean(raw.text, kind === "pitch" || kind === "voice" || kind === "look" ? MAX_PARAGRAPH_CHARS : MAX_LINE_CHARS);
    if (text === "") continue;
    if (kind === "line" || kind === "veil") {
      setAside.push({ claim: text, reason: "lines and veils are agreed with your players at the table, so they are never suggested" });
      continue;
    }
    if (!isSuggestedKind(kind)) continue;
    const key = `${kind}|${norm(text)}`;
    if (seen.has(key)) continue;
    if (SINGLE_PREMISE_KINDS.includes(kind) && suggestions.some((s) => s.kind === kind)) continue;
    seen.add(key);
    suggestions.push({ kind, text });
  }
  return { suggestions, setAside };
}

const isMark = (v: unknown): v is KnowledgeMark => (KNOWLEDGE_MARKS as readonly string[]).includes(v as string);

export function sanitizeTruths(
  parsed: unknown,
  candidates: readonly KnowerCandidate[],
  existingTitles: readonly string[],
): { suggestions: TruthSuggestion[]; setAside: CanonSetAside[] } {
  const byName = new Map<string, KnowerCandidate>();
  for (const c of candidates) if (!byName.has(norm(c.name))) byName.set(norm(c.name), c);
  const suggestions: TruthSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  const seen = new Set(existingTitles.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_TRUTH_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const title = clean(raw.title, MAX_LINE_CHARS);
    if (title === "" || !isMark(raw.knowledge)) continue;
    if (seen.has(norm(title))) continue;

    const knowers: KnowerCandidate[] = [];
    if (raw.knowledge === "some") {
      const names = Array.isArray(raw.known_to) ? raw.known_to : [];
      for (const n of names) {
        if (typeof n !== "string") continue;
        const found = byName.get(norm(n));
        if (!found) {
          setAside.push({ claim: n.trim(), reason: `"${clean(n, 80)}" is not a person or faction in this campaign, so it was not named as knowing "${title}"` });
          continue;
        }
        if (!knowers.some((k) => k.id === found.id) && knowers.length < MAX_KNOWERS) knowers.push(found);
      }
      if (knowers.length === 0) {
        setAside.push({ claim: title, reason: "it was marked known to some, but nobody in this campaign could be named as knowing it" });
        continue;
      }
    }
    seen.add(norm(title));
    suggestions.push({ title, knowledge: raw.knowledge, knowers });
  }
  return { suggestions, setAside };
}

export function premiseShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"kind":"${SUGGESTED_PREMISE_KINDS.join("|")}","text":"the entry, in plain words"}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function truthShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"title":"the truth, one line","knowledge":"${KNOWLEDGE_MARKS.join("|")}","known_to":["names copied exactly from the people and factions given; only when knowledge is some, otherwise []"]}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

// ── The other four helpers (#1226, frame 13 "Help on every part"): clues, questions, forces, lore ─────────────────

export const SPOT_KIND_VALUES = ["location", "npc", "quest_beat"] as const;
export type SpotKind = (typeof SPOT_KIND_VALUES)[number];

/** A place, person or quest beat a clue or a lore passage may lie at: always a real row of the campaign. */
export interface SpotCandidate {
  kind: SpotKind;
  id: string;
  name: string;
}

export const MAX_CLUE_SUGGESTIONS = 3;
export const MAX_QUESTION_SUGGESTIONS = 6;
export const MAX_FORCE_SUGGESTIONS = 3;
export const MAX_FORCE_STEPS = 5;
export const MAX_FORCE_QUESTS = 6;
/** The database check on `canon_entries.clock_size`. */
export const MIN_CLOCK_SIZE = 2;
export const MAX_CLOCK_SIZE = 12;
export const MAX_LORE_PASSAGES = 5;
export const MAX_PASSAGE_TITLE_CHARS = 120;
export const MAX_PASSAGE_BODY_CHARS = 1500;

export { LORE_KINDS, type LoreKind };
export const isLoreKind = (v: unknown): v is LoreKind => (LORE_KINDS as readonly string[]).includes(v as string);

export interface ClueSuggestion {
  title: string;
  spot: SpotCandidate;
}

export interface QuestionSuggestion {
  title: string;
}

export interface ForceWho {
  kind: "faction" | "npc";
  id: string;
  name: string;
}

export interface ForceQuestRef {
  id: string;
  title: string;
}

export interface ForceSuggestion {
  /** Who it is, as written: the entry's title. */
  title: string;
  /** The faction or person it was matched to; null when the model named someone the campaign does not have (free text). */
  who: ForceWho | null;
  wants: string;
  steps: string[];
  clockSize: number;
  quests: ForceQuestRef[];
}

export interface LorePassageSuggestion {
  title: string;
  /** Plain text: the client turns it into the rich body when it writes. */
  body: string;
  /** Where the passage comes out; never set on the first passage. */
  spot: SpotCandidate | null;
}

export interface LoreSuggestion {
  title: string;
  kind: LoreKind | null;
  passages: LorePassageSuggestion[];
}

const spotKey = (kind: string, id: string): string => `${kind}|${id}`;

function spotIndex(spots: readonly SpotCandidate[]): Map<string, SpotCandidate> {
  const byName = new Map<string, SpotCandidate>();
  for (const s of spots) {
    const key = `${s.kind}|${norm(s.name)}`;
    if (!byName.has(key)) byName.set(key, s);
  }
  return byName;
}

function readSpot(raw: unknown, index: Map<string, SpotCandidate>): { spot: SpotCandidate | null; named: string } {
  if (!isRecord(raw)) return { spot: null, named: "" };
  const name = typeof raw.name === "string" ? raw.name : "";
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  return { spot: index.get(`${kind}|${norm(name)}`) ?? null, named: clean(name, 80) };
}

/**
 * Clues to one secret. Each lies at ONE real place, person or beat: an unknown name is set aside, never a reference.
 * A spot this secret already uses (`usedSpots`, as `kind|id`) is set aside, and two proposals at one spot keep one.
 */
export function sanitizeClues(
  parsed: unknown,
  spots: readonly SpotCandidate[],
  usedSpots: ReadonlySet<string>,
): { suggestions: ClueSuggestion[]; setAside: CanonSetAside[] } {
  const index = spotIndex(spots);
  const suggestions: ClueSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  const taken = new Set(usedSpots);
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_CLUE_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const title = clean(raw.title, MAX_LINE_CHARS);
    if (title === "") continue;
    const { spot, named } = readSpot(raw.at, index);
    if (!spot) {
      setAside.push({ claim: title, reason: `"${named}" is not a place, person or quest beat in this campaign, so the clue has nowhere to lie` });
      continue;
    }
    const key = spotKey(spot.kind, spot.id);
    if (taken.has(key)) {
      setAside.push({ claim: title, reason: `a clue to this secret already lies at "${spot.name}"` });
      continue;
    }
    taken.add(key);
    suggestions.push({ title, spot });
  }
  return { suggestions, setAside };
}

/** Open questions. Repeats of a question the campaign keeps (or of one in the same answer) are dropped. */
export function sanitizeQuestions(
  parsed: unknown,
  existingTitles: readonly string[],
): { suggestions: QuestionSuggestion[]; setAside: CanonSetAside[] } {
  const suggestions: QuestionSuggestion[] = [];
  const seen = new Set(existingTitles.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_QUESTION_SUGGESTIONS) break;
    const title = clean(isRecord(raw) ? raw.title : raw, MAX_LINE_CHARS);
    if (title === "" || seen.has(norm(title))) continue;
    seen.add(norm(title));
    suggestions.push({ title });
  }
  return { suggestions, setAside: [] };
}

/**
 * Forces. `who` is matched to a real faction or person (free text when it matches none); `quests` are matched to real
 * quests by title and an unknown one is set aside; steps are trimmed, empties dropped and capped at five; the clock
 * size is clamped to what the database accepts, and a force with no steps or no readable clock is set aside.
 */
export function sanitizeForces(
  parsed: unknown,
  whos: readonly ForceWho[],
  quests: readonly ForceQuestRef[],
  existingTitles: readonly string[],
): { suggestions: ForceSuggestion[]; setAside: CanonSetAside[] } {
  const whoByName = new Map<string, ForceWho>();
  for (const w of whos) if (!whoByName.has(norm(w.name))) whoByName.set(norm(w.name), w);
  const questByTitle = new Map<string, ForceQuestRef>();
  for (const q of quests) if (!questByTitle.has(norm(q.title))) questByTitle.set(norm(q.title), q);
  const suggestions: ForceSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  const seen = new Set(existingTitles.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_FORCE_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const who = clean(raw.who, MAX_LINE_CHARS);
    const wants = clean(raw.wants, MAX_LINE_CHARS);
    if (who === "" || wants === "") continue;
    const matched = whoByName.get(norm(who)) ?? null;
    const title = matched ? matched.name : who;
    if (seen.has(norm(title))) continue;

    const steps = (Array.isArray(raw.steps) ? raw.steps : [])
      .map((s) => clean(s, MAX_LINE_CHARS))
      .filter((s) => s !== "")
      .slice(0, MAX_FORCE_STEPS);
    if (steps.length === 0) {
      setAside.push({ claim: title, reason: "it came with no steps, so there is nothing for the force to do next" });
      continue;
    }
    const size = typeof raw.clock_size === "number" && Number.isFinite(raw.clock_size) ? Math.round(raw.clock_size) : null;
    if (size === null) {
      setAside.push({ claim: title, reason: "it came with no readable clock size" });
      continue;
    }

    const met: ForceQuestRef[] = [];
    for (const q of Array.isArray(raw.quests) ? raw.quests : []) {
      if (typeof q !== "string") continue;
      const found = questByTitle.get(norm(q));
      if (!found) {
        setAside.push({ claim: q.trim(), reason: `"${clean(q, 80)}" is not a quest in this campaign, so the party does not meet "${title}" there` });
        continue;
      }
      if (!met.some((m) => m.id === found.id) && met.length < MAX_FORCE_QUESTS) met.push(found);
    }
    seen.add(norm(title));
    suggestions.push({
      title,
      who: matched,
      wants,
      steps,
      clockSize: Math.min(MAX_CLOCK_SIZE, Math.max(MIN_CLOCK_SIZE, size)),
      quests: met,
    });
  }
  return { suggestions, setAside };
}

/**
 * One lore entry, told in passages. It needs at least one passage with words; the first is told with the entry and
 * never carries a place; a later passage's place is matched to a real row (else the passage stays, placed nowhere,
 * and the unknown name is set aside). The DM's own title and kind win over the model's.
 */
export function sanitizeLore(
  parsed: unknown,
  spots: readonly SpotCandidate[],
  existingTitles: readonly string[],
  requested: { title: string; kind: LoreKind | null },
): { suggestions: LoreSuggestion[]; setAside: CanonSetAside[] } {
  const index = spotIndex(spots);
  const setAside: CanonSetAside[] = [];
  const root = isRecord(parsed) ? parsed : {};
  const title = clean(requested.title, MAX_LINE_CHARS) || clean(root.title, MAX_LINE_CHARS);
  if (title === "") return { suggestions: [], setAside };
  if (existingTitles.some((t) => norm(t) === norm(title))) {
    setAside.push({ claim: title, reason: "the campaign already has a lore entry with this title" });
    return { suggestions: [], setAside };
  }
  const passages: LorePassageSuggestion[] = [];
  for (const raw of Array.isArray(root.passages) ? root.passages : []) {
    if (passages.length >= MAX_LORE_PASSAGES) break;
    if (!isRecord(raw)) continue;
    const body = clean(raw.text, MAX_PASSAGE_BODY_CHARS);
    if (body === "") continue;
    let spot: SpotCandidate | null = null;
    if (passages.length > 0 && raw.at !== undefined && raw.at !== null) {
      const read = readSpot(raw.at, index);
      spot = read.spot;
      if (!spot && read.named !== "") {
        setAside.push({ claim: read.named, reason: `"${read.named}" is not a place, person or quest beat in this campaign, so the passage is placed nowhere` });
      }
    }
    passages.push({ title: clean(raw.title, MAX_PASSAGE_TITLE_CHARS), body, spot });
  }
  if (passages.length === 0) return { suggestions: [], setAside };
  const kind = requested.kind ?? (isLoreKind(root.kind) ? root.kind : null);
  return { suggestions: [{ title, kind, passages }], setAside };
}

const SPOT_NOTE = 'an object {"kind":"location|npc|quest_beat","name":"copied exactly from the list given"}';

export function clueShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"title":"the clue, one line","at":${SPOT_NOTE}}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function questionShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[{"title":"the question, one line"}]}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function forceShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"who":"a faction or person copied exactly from the list given, or a new name if none fits","wants":"what they want, one line","steps":["three to five next steps, in order"],"clock_size":4 to 8,"quests":["quest titles copied exactly from the list given, or []"]}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function loreShape(): string {
  return `\n\nReturn a single JSON object {"title":"the entry's title","kind":"${LORE_KINDS.join("|")}","passages":[{"title":"the passage's heading","text":"plain text, one or two short paragraphs","at":null or ${SPOT_NOTE}}]}. The first passage's "at" is always null.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}
