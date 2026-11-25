import { tickTitle } from "./canonChronicle";
import { factReview } from "./canonTableFacts";
import { factChains, type StoryFact } from "@/lib/table/solo/storyRecord";
import { sessionWhen } from "@/lib/sessions/sessionPrefill";
import type { CanonClue, CanonEntry, CanonForceStep, CanonForceTick, CanonLorePassage } from "@/types/canon.types";
import type { CampaignSession } from "@/types/session.types";

/**
 * What the canon did in one session (#1258 item 8): the clues the party found, the passages told, the secrets revealed,
 * the force steps reached, the clock moves and the questions answered, each read from the session id the table stored
 * when it happened. Pure; the Chronicle shows it under each entry and the Chronicler is told the same list.
 */

export type SessionCanonKind = "clues" | "passages" | "secrets" | "truths" | "steps" | "ticks" | "questions" | "facts";

export interface SessionCanonItem {
  key: string;
  title: string;
  /** The canon entry it belongs to, as the Canon page opens it. */
  to: { path: string; query: Record<string, string> };
  /** What happened to it, one word for the row ("Found", "Told", "Table line"). */
  word: string;
}

export interface SessionCanonGroup {
  kind: SessionCanonKind;
  /** "Clues found", "Passages told" and so on. */
  label: string;
  items: SessionCanonItem[];
}

export interface SessionCanon {
  /** Only the kinds that have something, in a fixed order. */
  groups: SessionCanonGroup[];
  /** The same items in one list, a kind on each (#1279 item 31), in the order the kinds run. */
  rows: SessionCanonItem[];
  total: number;
}

const LABEL: Record<SessionCanonKind, string> = {
  clues: "Clues found",
  passages: "Passages told",
  secrets: "Secrets revealed",
  truths: "Truths told",
  steps: "Steps reached",
  ticks: "Clock moves",
  questions: "Questions answered",
  facts: "Table lines to review",
};
const WORD: Record<SessionCanonKind, string> = {
  clues: "Found",
  passages: "Told",
  secrets: "Revealed",
  truths: "Told",
  steps: "Step reached",
  ticks: "Clock moved",
  questions: "Answered",
  facts: "Table line",
};
const ORDER: readonly SessionCanonKind[] = ["clues", "passages", "secrets", "truths", "steps", "ticks", "questions", "facts"];

const toEntry = (id: string): SessionCanonItem["to"] => ({ path: "/canon", query: { entry: id } });
/** Where the table's lines are reviewed: the Truths chapter, which holds the "What the table added" inbox. */
const TO_REVIEW: SessionCanonItem["to"] = { path: "/canon/truths", query: {} };

/** The calendar day of a moment. A bare date (a session logged by hand) is already a day and is read as written, so no time zone moves it. */
function dayOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Oldest first, by the moment each thing happened; ties keep the order given. */
const byMoment = <T extends { at: string }>(rows: T[]): T[] => [...rows].sort((a, b) => a.at.localeCompare(b.at));

export function canonThisSession(input: {
  session: Pick<CampaignSession, "id" | "started_at" | "played_on" | "created_at">;
  entries: readonly CanonEntry[];
  clues: readonly CanonClue[];
  passages: readonly CanonLorePassage[];
  steps: readonly CanonForceStep[];
  ticks: readonly CanonForceTick[];
  /** The table's story record: its unreviewed lines from this session are listed too, and left out of the Chronicler's text. */
  facts?: readonly StoryFact[];
}): SessionCanon {
  const { session } = input;
  const entryTitle = new Map(input.entries.map((e) => [e.id, e.title] as const));
  const forceTitle = new Map(input.entries.filter((e) => e.part === "force").map((e) => [e.id, e.title] as const));
  const found: Record<SessionCanonKind, ({ at: string } & SessionCanonItem)[]> = { clues: [], passages: [], secrets: [], truths: [], steps: [], ticks: [], questions: [], facts: [] };

  for (const clue of input.clues) {
    if (clue.found_session_id === session.id && clue.found_at !== null) found.clues.push({ at: clue.found_at, key: `clue:${clue.id}`, title: clue.title, to: toEntry(clue.secret_id), word: WORD.clues });
  }
  for (const passage of input.passages) {
    if (passage.told_session_id !== session.id || passage.told_at === null) continue;
    const title = passage.title.trim() || entryTitle.get(passage.entry_id);
    if (title === undefined) continue;
    found.passages.push({ at: passage.told_at, key: `passage:${passage.id}`, title, to: toEntry(passage.entry_id), word: WORD.passages });
  }
  for (const entry of input.entries) {
    if (entry.part === "secret" && entry.revealed_session_id === session.id && entry.revealed_at !== null) {
      found.secrets.push({ at: entry.revealed_at, key: `secret:${entry.id}`, title: entry.title, to: toEntry(entry.id), word: WORD.secrets });
    }
  }
  // A truth told to the party carries the same stamp a revealed secret does (#1279 item 27).
  for (const entry of input.entries) {
    if (entry.part === "truth" && entry.revealed_session_id === session.id && entry.revealed_at !== null) {
      found.truths.push({ at: entry.revealed_at, key: `truth:${entry.id}`, title: entry.title, to: toEntry(entry.id), word: WORD.truths });
    }
  }
  for (const step of input.steps) {
    const force = forceTitle.get(step.force_id);
    if (step.reached_session_id === session.id && step.reached_at !== null && force !== undefined) {
      found.steps.push({ at: step.reached_at, key: `step:${step.id}`, title: `${force}: ${step.title}`, to: toEntry(step.force_id), word: WORD.steps });
    }
  }
  for (const tick of input.ticks) {
    const force = forceTitle.get(tick.force_id);
    // A tick that reached a step is that step, already listed above; counting both would say one thing twice.
    if (tick.session_id !== session.id || tick.step_id !== null || force === undefined) continue;
    found.ticks.push({ at: tick.created_at, key: `tick:${tick.id}`, title: tickTitle(force, tick), to: toEntry(tick.force_id), word: WORD.ticks });
  }
  // A question records when it was answered but not in which session (it has `closed_at` and no session id), so it is
  // matched to the session played on that calendar day. Two sessions on one day would both list it; that is rare enough.
  const playedDay = dayOf(sessionWhen(session));
  for (const entry of input.entries) {
    if (entry.part === "question" && entry.closed_as === "answered" && entry.closed_at !== null && dayOf(entry.closed_at) === playedDay) {
      found.questions.push({ at: entry.closed_at, key: `question:${entry.id}`, title: entry.title, to: toEntry(entry.id), word: WORD.questions });
    }
  }

  // The table's lines nobody has kept or struck yet; a line a correction overtook is listed with the version that did.
  for (const chain of factChains([...(input.facts ?? [])])) {
    if (chain[0]?.fact.source !== "table") continue;
    for (const { fact, closed } of chain) {
      if (fact.session_id === session.id && fact.source === "table" && factReview(fact, closed) === "new") {
        found.facts.push({ at: fact.created_at, key: `fact:${fact.id}`, title: fact.body, to: TO_REVIEW, word: WORD.facts });
      }
    }
  }

  const groups = ORDER.flatMap((kind): SessionCanonGroup[] =>
    found[kind].length === 0 ? [] : [{ kind, label: LABEL[kind], items: byMoment(found[kind]).map(({ at: _at, ...item }) => item) }],
  );
  return { groups, rows: groups.flatMap((g) => g.items), total: groups.reduce((n, g) => n + g.items.length, 0) };
}

/**
 * The same list as plain text for the Chronicler's draft: one line per kind, the titles after it. Empty when the
 * session changed nothing, so the draft is not told there was canon where there was none.
 */
export function sessionCanonText(canon: SessionCanon): string {
  // Lines nobody has reviewed are not canon yet, so the Chronicler is not told them.
  const groups = canon.groups.filter((g) => g.kind !== "facts");
  if (groups.length === 0) return "";
  const lines = groups.map((g) => `- ${g.label}: ${g.items.map((i) => i.title).join("; ")}`);
  return ["What changed in the campaign's canon this session:", ...lines].join("\n");
}
