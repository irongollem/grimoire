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
import { KNOWLEDGE_MARKS, PREMISE_KINDS, type KnowledgeMark, type PremiseKind } from "../../../src/types/canon.types.ts";

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
