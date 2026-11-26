/**
 * The check on the canon helpers' answers (#1226 story 2, frame 13): "Draft from a pitch" for the premise and
 * "Suggest truths" for the truths. The model proposes; this file decides what survives, so the rules live in code and
 * not in a prompt a model may forget. Pure (no Deno-only imports), so the browser imports it as
 * `@edge-shared/canonSuggestions.ts`.
 *
 *  - premise suggestions cover the campaign starter, including line and veil drafts; the DM reviews those with
 *    players before acceptance (acceptance activates them for AI, while sharing remains separate);
 *  - a truth carries a knowledge mark; "some" must name who knows it, and every name is matched back (case
 *    insensitively) to a real person or faction of the campaign. An unknown name never becomes a tie, and a "some"
 *    truth left with nobody is set aside rather than offered as a truth nobody knows.
 */
import { KNOWLEDGE_MARKS, PREMISE_KINDS, type KnowledgeMark, LORE_KINDS, type LoreKind } from "../../../src/types/canon.types.ts";

/** Every premise kind the campaign starter may propose, including private line and veil drafts. */
export const SUGGESTED_PREMISE_KINDS = PREMISE_KINDS;
export type SuggestedPremiseKind = (typeof SUGGESTED_PREMISE_KINDS)[number];

/** A kind that holds one entry: a second proposal of it in one answer is dropped. */
export const SINGLE_PREMISE_KINDS: readonly SuggestedPremiseKind[] = ["pitch", "voice", "look"];
/**
 * Versions of a pitch, voice or look one sectioned draft may offer (Design it with me, #1282): the DM chooses between
 * them, from the one closest to their notes to the boldest. A whole-starter draft still offers one of each.
 */
export const MAX_SINGLE_ALTERNATIVES = 3;

export const MAX_PREMISE_SUGGESTIONS = 18;
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

/**
 * The `kinds` a request narrows the premise to ("Enhance with AI" on one section): a non-empty list of premise kinds, or
 * absent for the whole starter. Anything else is the caller's mistake, not a thing to guess at.
 */
export function readPremiseKinds(raw: unknown): { ok: true; kinds: SuggestedPremiseKind[] | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, kinds: null };
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isSuggestedKind)) return { ok: false };
  return { ok: true, kinds: [...new Set(raw)] };
}

/** With `kinds`, only those kinds survive: the model may stray, the section the DM asked for is all it gets to write. */
export function sanitizePremise(
  parsed: unknown,
  existing: readonly ExistingPremise[],
  kinds: readonly SuggestedPremiseKind[] | null = null,
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
    if (!isSuggestedKind(kind)) continue;
    if (kinds !== null && !kinds.includes(kind)) continue;
    const key = `${kind}|${norm(text)}`;
    if (seen.has(key)) continue;
    const allowed = kinds === null ? 1 : MAX_SINGLE_ALTERNATIVES;
    if (SINGLE_PREMISE_KINDS.includes(kind) && suggestions.filter((s) => s.kind === kind).length >= allowed) continue;
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

export function premiseShape(kinds: readonly SuggestedPremiseKind[] | null = null): string {
  if (kinds !== null) {
    return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"kind":"${kinds.join("|")}","text":"the entry, in plain words"}. Write ONLY these kinds of entry: ${kinds.join(", ")}. Write no other kind. The DM's words are rough notes, not the finished text: develop them into full, specific entries that build on the pitch, the premise and everything the canon already holds, and never hand the notes back reworded. A pitch is a full paragraph of three to five sentences; a voice or a look is a short paragraph; a theme, table note, line or veil is one complete sentence. A pitch, voice or look may be offered in up to ${MAX_SINGLE_ALTERNATIVES} versions for the DM to choose between. Lines and veils are private discussion drafts, never agreed boundaries.\n` +
      "Return only the JSON object. No markdown fences, no explanation.";
  }
  return `\n\nReturn a single JSON object {"suggestions":[...]}, up to ${MAX_PREMISE_SUGGESTIONS} suggestions, each {"kind":"${SUGGESTED_PREMISE_KINDS.join("|")}","text":"the entry, in plain words"}. Build the campaign starter from the DM's pitch and campaign context. Include one pitch, at least one theme, one table note, one voice, one look, and one grounded line and veil draft. Existing pitch, voice, and look may be proposed as replacements only when meaningfully improved; the DM will see the old and new text and confirm before replacing. Lines and veils are private discussion drafts, never agreed boundaries: the DM must review them with players before accepting.\n` +
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
/** Leave room for every distinct faction with an active agenda in the canon, without unbounded model output. */
export const MAX_FORCE_SUGGESTIONS = 10;
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
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion {"who":"a faction or person copied exactly from the list given, or a new name if none fits","wants":"what they want, one line","steps":["three to five next steps, in order"],"clock_size":4 to 8,"quests":["quest titles copied exactly from the list given, or []"]}. Include every distinct listed faction that has an active agenda in the canon or the DM's steer; do not stop at an arbitrary count, and do not invent extra forces just to fill a quota. At most ${MAX_FORCE_SUGGESTIONS} suggestions.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function loreShape(): string {
  return `\n\nReturn a single JSON object {"title":"the entry's title","kind":"${LORE_KINDS.join("|")}","passages":[{"title":"the passage's heading","text":"plain text, one or two short paragraphs","at":null or ${SPOT_NOTE}}]}. The first passage's "at" is always null.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

// ── Suggest secrets (#1255 item 7): a secret and up to three clues, each placed by id ────────────────────────────

export const MAX_SECRET_SUGGESTIONS = 5;
export const MAX_SECRET_CLUES = 3;

export interface SecretClueSuggestion {
  title: string;
  /** The real place, person or beat the clue lies at; null when the model named none, or one the campaign does not have. */
  spot: SpotCandidate | null;
}

export interface SecretSuggestion {
  title: string;
  clues: SecretClueSuggestion[];
}

/**
 * Secrets with their clues. A clue's place is matched by id to a candidate the server read from the campaign: an unknown
 * id (or kind) is dropped and the clue stays, unplaced, rather than the whole answer failing. One place holds one clue
 * of a secret, so a second clue at the same place is left unplaced too. A secret that came with no readable clue is set
 * aside, and a secret already in the campaign (or twice in one answer) is skipped.
 */
export function sanitizeSecrets(
  parsed: unknown,
  spots: readonly SpotCandidate[],
  existingTitles: readonly string[],
): { suggestions: SecretSuggestion[]; setAside: CanonSetAside[] } {
  const byId = new Map<string, SpotCandidate>();
  for (const s of spots) byId.set(spotKey(s.kind, s.id), s);
  const suggestions: SecretSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  const seen = new Set(existingTitles.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_SECRET_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const title = clean(raw.title, MAX_LINE_CHARS);
    if (title === "" || seen.has(norm(title))) continue;
    const taken = new Set<string>();
    const clues: SecretClueSuggestion[] = [];
    for (const c of Array.isArray(raw.clues) ? raw.clues : []) {
      if (clues.length >= MAX_SECRET_CLUES) break;
      if (!isRecord(c)) continue;
      const clueTitle = clean(c.title, MAX_LINE_CHARS);
      if (clueTitle === "") continue;
      const at = isRecord(c.at) ? c.at : null;
      const found = at && typeof at.kind === "string" && typeof at.id === "string" ? byId.get(spotKey(at.kind, at.id)) ?? null : null;
      const spot = found && !taken.has(spotKey(found.kind, found.id)) ? found : null;
      if (spot) taken.add(spotKey(spot.kind, spot.id));
      clues.push({ title: clueTitle, spot });
    }
    if (clues.length === 0) {
      setAside.push({ claim: title, reason: "it came with no clues, so the party would have no way to find it" });
      continue;
    }
    seen.add(norm(title));
    suggestions.push({ title, clues });
  }
  return { suggestions, setAside };
}

export function secretShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, up to ${MAX_SECRET_SUGGESTIONS} suggestions, each {"title":"the secret, one statement of what is true and hidden","clues":[{"title":"the clue, one line, hinting at the secret and never stating it","at":null or {"kind":"location|npc|quest_beat","id":"the id copied exactly from the list given"}}]}. Give every secret three clues, each at a different place, person or beat from the list where one fits.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

// ── Design it with me (#1282): arcs, peoples and a backstory's DM passages ────────────────────────────────────────

export const MAX_ARC_SUGGESTIONS = 6;
export const MAX_ARC_NAME_CHARS = 80;
export const MAX_BACKSTORY_SUGGESTIONS = 5;

/** A premise theme line an arc may carry: always a real `canon_entries` row of the campaign. */
export interface ThemeCandidate {
  id: string;
  text: string;
}

export interface ArcSuggestion {
  name: string;
  summary: string;
  question: string | null;
  stakes: string | null;
  /** One of the given theme ids, or null: an unknown id never becomes a tie, and the arc stays. */
  themeId: string | null;
}

/**
 * Arcs. The name is the arc's (1 to 80 characters) and a name the campaign already has, or one twice in the answer, is
 * skipped. A `theme_id` is kept only when it is one the server gave the model.
 */
export function sanitizeArcs(
  parsed: unknown,
  themes: readonly ThemeCandidate[],
  existingNames: readonly string[],
): { suggestions: ArcSuggestion[]; setAside: CanonSetAside[] } {
  const themeIds = new Set(themes.map((t) => t.id));
  const suggestions: ArcSuggestion[] = [];
  const seen = new Set(existingNames.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_ARC_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const name = clean(raw.name, MAX_ARC_NAME_CHARS);
    const summary = clean(raw.summary, MAX_LINE_CHARS);
    if (name === "" || summary === "" || seen.has(norm(name))) continue;
    seen.add(norm(name));
    suggestions.push({
      name,
      summary,
      question: clean(raw.question, MAX_LINE_CHARS) || null,
      stakes: clean(raw.stakes, MAX_LINE_CHARS) || null,
      themeId: typeof raw.theme_id === "string" && themeIds.has(raw.theme_id) ? raw.theme_id : null,
    });
  }
  return { suggestions, setAside: [] };
}

export const PEOPLE_KIND_VALUES = ["species", "library_species"] as const;
export type PeopleSuggestionKind = (typeof PEOPLE_KIND_VALUES)[number];

/** A record the campaign may use as a people: its own species (a uuid) or a shared book's (a text id). */
export interface PeopleCandidate {
  kind: PeopleSuggestionKind;
  id: string;
  name: string;
}

export interface ListedPeople {
  kind: string;
  recordId: string;
  /** The culture's own name, or null when it goes by the record's. */
  name: string | null;
  percent: number;
}

export interface PeopleSuggestion {
  kind: PeopleSuggestionKind;
  recordId: string;
  /** The record's name, for the review to show. */
  recordName: string;
  /** A culture's own name, or null. */
  name: string | null;
  percent: number;
}

export const MAX_PEOPLE_SUGGESTIONS = 8;
export const MAX_PEOPLE_NAME_CHARS = 80;

/**
 * Peoples with their shares. Every record is matched by id AND kind to a candidate the server read for this campaign:
 * anything else is set aside. A record and name already listed (or twice in the answer) is set aside, and shares are
 * added up with what is listed: a people whose whole share would take the total past 100 is set aside, so the database's
 * hundred-percent rule is never what refuses an accept.
 */
export function sanitizePeoples(
  parsed: unknown,
  candidates: readonly PeopleCandidate[],
  listed: readonly ListedPeople[],
): { suggestions: PeopleSuggestion[]; setAside: CanonSetAside[] } {
  const byKey = new Map(candidates.map((c) => [`${c.kind}|${c.id}`, c]));
  const identity = (kind: string, id: string, name: string | null) => `${kind}|${id}|${norm(name ?? "")}`;
  const seen = new Set(listed.map((p) => identity(p.kind, p.recordId, p.name)));
  let total = listed.reduce((sum, p) => sum + p.percent, 0);
  const suggestions: PeopleSuggestion[] = [];
  const setAside: CanonSetAside[] = [];
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_PEOPLE_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const kind = typeof raw.kind === "string" ? raw.kind : "";
    const id = typeof raw.record_id === "string" ? raw.record_id : "";
    const found = byKey.get(`${kind}|${id}`);
    const own = clean(raw.name, MAX_PEOPLE_NAME_CHARS) || null;
    if (!found) {
      setAside.push({ claim: own ?? (id || "a people"), reason: "it is not a species this campaign has or may use, so it cannot be a people here" });
      continue;
    }
    const percent = typeof raw.percent === "number" && Number.isFinite(raw.percent) ? Math.round(raw.percent) : 0;
    if (percent < 1 || percent > 100) continue;
    const label = own ?? found.name;
    const key = identity(found.kind, found.id, own);
    if (seen.has(key)) {
      setAside.push({ claim: label, reason: "this people is already listed" });
      continue;
    }
    if (total + percent > 100) {
      setAside.push({ claim: label, reason: `its ${percent}% would take the peoples past 100%` });
      continue;
    }
    seen.add(key);
    total += percent;
    suggestions.push({ kind: found.kind, recordId: found.id, recordName: found.name, name: own, percent });
  }
  return { suggestions, setAside };
}

export interface BackstorySuggestion {
  title: string;
  /** Plain text, paragraphs: the client turns it into the rich body when it writes. */
  body: string;
}

/** A passage the DM's side of a past might hold. A title the backstory already has, or one twice in the answer, is skipped. */
export function sanitizeBackstory(
  parsed: unknown,
  existingTitles: readonly string[],
): { suggestions: BackstorySuggestion[]; setAside: CanonSetAside[] } {
  const suggestions: BackstorySuggestion[] = [];
  const seen = new Set(existingTitles.map(norm));
  for (const raw of listOf(parsed, "suggestions")) {
    if (suggestions.length >= MAX_BACKSTORY_SUGGESTIONS) break;
    if (!isRecord(raw)) continue;
    const title = clean(raw.title, MAX_PASSAGE_TITLE_CHARS);
    const body = clean(raw.body, MAX_PASSAGE_BODY_CHARS);
    if (title === "" || body === "" || seen.has(norm(title))) continue;
    seen.add(norm(title));
    suggestions.push({ title, body });
  }
  return { suggestions, setAside: [] };
}

export function arcShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, up to ${MAX_ARC_SUGGESTIONS} suggestions, each {"name":"the arc's name, up to ${MAX_ARC_NAME_CHARS} characters","summary":"one line of what the arc is about","question":"the dramatic question it asks, one line, or leave out","stakes":"what is at stake, one line, or leave out","theme_id":"the id of one theme line given, copied exactly, or leave out"}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function peopleShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, up to ${MAX_PEOPLE_SUGGESTIONS} suggestions, each {"kind":"${PEOPLE_KIND_VALUES.join("|")}","record_id":"the id copied exactly from the second field of one line given","name":"a culture's own name, only when it has one distinct from its species (never the species' name or its plural); otherwise leave out","percent":1 to 100}. Every record_id must be copied from the lines given, with the kind on its line. The percent shares of what you propose and of the peoples already listed must not add up to more than 100.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}

export function backstoryShape(): string {
  return `\n\nReturn a single JSON object {"suggestions":[...]}, up to ${MAX_BACKSTORY_SUGGESTIONS} suggestions, each {"title":"the passage's heading","body":"plain text, one or two short paragraphs"}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}
