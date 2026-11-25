/**
 * What counts as a loose end in the canon, decided once (#1279 item 21). Tonight (the page the DM runs the table from)
 * and the paid "Read it through" both used to have a rule of their own, and they disagreed: a question with no quest was
 * a loose end only in the read, a secret with two clues only in Tonight. Both now call `looseEnds` here.
 *
 * Pure and dependency-free, so it runs in Deno (the edge function) and in Vite (`@edge-shared/canonLooseEnds.ts`).
 * It is arithmetic over rows, never a model's guess.
 *
 * A loose end is something the canon promises or holds open that the DM has not got ready. Each case and why it is one:
 *  - SECRET, not yet revealed: with no clue the party has nothing to find; with fewer than MIN_CLUES, one missed roll is a
 *    dead end; with no clue placed anywhere, no clue can come out at the table. A revealed secret has done its job.
 *  - FORCE, still open: with no step left to reach it has nothing to do next; with no quest tied to it nothing in play
 *    can show it moving. A closed force is finished.
 *  - QUESTION, still open: with no quest tied to it nothing in play points at it; open through more than
 *    STALE_QUESTION_SESSIONS sessions it has been forgotten rather than kept. An answered question is finished.
 *  - BACKSTORY: with no open thread (a question or secret tied to it by a `related_to` / `led_to` link) the character's
 *    past gives the DM nothing to pull on.
 *  - ARC, running: with no open force in it and no active quest in it, nothing is moving the story it names.
 * Anything the DM has said to leave (`loose_end_left_at` set) is skipped, so a deliberate gap stops nagging.
 */

export type LooseEndKind = "secret" | "force" | "question" | "backstory" | "arc";

/** A secret with fewer clues than this is thin: one clue is one missed roll from a dead end. */
export const MIN_CLUES = 3;
/** A question open through more sessions than this has been forgotten rather than kept. */
export const STALE_QUESTION_SESSIONS = 5;

/** The link types that tie one canon entry to another as a thread of a backstory. */
const THREAD_LINK_TYPES = ["related_to", "led_to"];

export interface LooseEntry {
  id: string;
  part: string;
  title: string;
  created_at: string;
  revealed_at: string | null;
  closed_as: string | null;
  arc_id: string | null;
  party_member_id: string | null;
  loose_end_left_at: string | null;
}

export interface LooseClue {
  secret_id: string;
  location_id: string | null;
  npc_id: string | null;
  quest_beat_id: string | null;
  item_id: string | null;
  document_id: string | null;
  passage_id: string | null;
}

export interface LooseEndsInput {
  entries: readonly LooseEntry[];
  clues: readonly LooseClue[];
  steps: readonly { force_id: string; reached_at: string | null }[];
  entryQuests: readonly { entry_id: string }[];
  links: readonly { from_kind: string; from_id: string | null; to_kind: string; to_id: string | null; type: string }[];
  arcs: readonly { id: string; name: string; status: string; loose_end_left_at?: string | null }[];
  quests: readonly { status: string; arc_id: string | null }[];
  sessions: readonly { created_at: string }[];
}

export interface LooseEndFound {
  /** `secret:<id>`, `force:<id>`, `question:<id>`, `backstory:<id>` or `arc:<id>`: stable across reads. */
  key: string;
  kind: LooseEndKind;
  /** The entry's id, or the arc's id for an arc (left through `canon_arcs.loose_end_left_at`). */
  subjectId: string;
  title: string;
  /** Short and plain, one per reason it is loose. Never empty. */
  reasons: string[];
}

const isPlaced = (c: LooseClue) => c.location_id !== null || c.npc_id !== null || c.quest_beat_id !== null || c.item_id !== null || c.document_id !== null || c.passage_id !== null;

/** Whether a question or secret is still open: an answered question and a revealed secret are paid off. */
const isOpenThread = (e: LooseEntry) => (e.part === "question" && e.closed_as === null) || (e.part === "secret" && e.revealed_at === null);

/** Whether a backstory has an open question or secret tied to it by a thread link, from either end. */
function hasOpenThread(backstoryId: string, entries: readonly LooseEntry[], links: LooseEndsInput["links"]): boolean {
  const tied = new Set<string>();
  for (const l of links) {
    if (l.from_kind !== "canon" || l.to_kind !== "canon" || !THREAD_LINK_TYPES.includes(l.type)) continue;
    if (l.from_id === backstoryId && l.to_id !== null) tied.add(l.to_id);
    else if (l.to_id === backstoryId && l.from_id !== null) tied.add(l.from_id);
  }
  return entries.some((e) => tied.has(e.id) && isOpenThread(e));
}

export function looseEnds(input: LooseEndsInput): LooseEndFound[] {
  const out: LooseEndFound[] = [];
  const { entries } = input;
  const kept = (e: LooseEntry) => e.loose_end_left_at === null;
  const open = (e: LooseEntry) => e.closed_as === null;
  const push = (kind: LooseEndKind, subjectId: string, title: string, reasons: string[]) => {
    if (reasons.length > 0) out.push({ key: `${kind}:${subjectId}`, kind, subjectId, title, reasons });
  };

  for (const secret of entries.filter((e) => e.part === "secret" && e.revealed_at === null && kept(e))) {
    const clues = input.clues.filter((c) => c.secret_id === secret.id);
    const reasons: string[] = [];
    if (clues.length === 0) reasons.push("No clues yet");
    else {
      if (clues.length < MIN_CLUES) reasons.push(`${clues.length} ${clues.length === 1 ? "clue" : "clues"}, fewer than ${MIN_CLUES}`);
      if (!clues.some(isPlaced)) reasons.push("No clue is placed anywhere");
    }
    push("secret", secret.id, secret.title, reasons);
  }

  for (const force of entries.filter((e) => e.part === "force" && open(e) && kept(e))) {
    const reasons: string[] = [];
    if (!input.steps.some((s) => s.force_id === force.id && s.reached_at === null)) reasons.push("No step left to reach");
    if (!input.entryQuests.some((q) => q.entry_id === force.id)) reasons.push("No quest tied to it");
    push("force", force.id, force.title, reasons);
  }

  for (const question of entries.filter((e) => e.part === "question" && open(e) && kept(e))) {
    const reasons: string[] = [];
    if (!input.entryQuests.some((q) => q.entry_id === question.id)) reasons.push("No quest tied to it");
    const since = input.sessions.filter((s) => s.created_at > question.created_at).length;
    if (since > STALE_QUESTION_SESSIONS) reasons.push(`Open through ${since} sessions`);
    push("question", question.id, question.title, reasons);
  }

  for (const backstory of entries.filter((e) => e.part === "backstory" && kept(e))) {
    if (!hasOpenThread(backstory.id, entries, input.links)) push("backstory", backstory.id, backstory.title, ["No open thread"]);
  }

  // An arc the DM left is not loose either: one that waits on purpose (#1279 follow-up).
  for (const arc of input.arcs.filter((a) => a.status === "running" && (a.loose_end_left_at ?? null) === null)) {
    const moving = entries.some((e) => e.part === "force" && open(e) && e.arc_id === arc.id);
    const played = input.quests.some((q) => q.arc_id === arc.id && q.status === "active");
    if (!moving && !played) push("arc", arc.id, arc.name, ["Running, with no force moving and no quest active"]);
  }
  return out;
}
