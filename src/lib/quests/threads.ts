/**
 * Threads, as the surfaces see them (Quest Manager Redesign, frames 2, 4, 7, 8).
 *
 * A quest holds several live cursors; each is a thread. Every surface that
 * shows one — the story flow's swimlanes and party chips, the cockpit's thread
 * bar, the quest card's spines, the player's journal columns — names it by a
 * letter and paints it with a tone, and they must agree with each other. This
 * module is where that agreement lives: the ORDER of a quest's threads, the
 * LETTER each order position gets, and the TONE each letter wears.
 *
 * Deliberately structural: it reads only the fields it needs so a runtime
 * context row, a `quest_threads` row and a projection row all qualify.
 */

export interface ThreadLike {
  id: string;
  label: string;
  status: "live" | "waiting" | "closed" | "merged";
  created_at: string;
}

/**
 * Live and waiting threads first (a waiting thread is still at the table,
 * parked), then closed, then merged; within a group, oldest first — so the
 * first thread a quest ever had keeps letter A for as long as it lives.
 */
export function orderThreads<T extends ThreadLike>(threads: readonly T[]): T[] {
  const rank: Record<ThreadLike["status"], number> = { live: 0, waiting: 0, closed: 1, merged: 2 };
  return [...threads].sort((a, b) =>
    rank[a.status] - rank[b.status]
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id));
}

/** A, B, C … Z, then AA, AB — a quest will never get there, but the function
 *  should not lie past the alphabet. */
export function threadLetter(index: number): string {
  if (index < 0) return "?";
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * The tone a thread wears, by its order among the quest's threads. Gold is the
 * app's primary and the first thread's colour on every board of the design;
 * info-blue is the second, arcane the third. A fourth thread wraps to gold
 * again — three concurrent threads is already more than a table can hold.
 *
 * `text` is an ink token (readable on both themes); `bg`/`border` use the
 * surface-strength tone; `dot` is the solid fill for a status dot.
 */
export interface ThreadTone {
  text: string;
  bg: string;
  border: string;
  dot: string;
  /** For inline styles that need the raw colour (a swimlane's SVG stroke). */
  cssVar: string;
}

const TONES: readonly ThreadTone[] = [
  { text: "text-primary", bg: "bg-primary/10", border: "border-primary", dot: "bg-primary", cssVar: "var(--primary)" },
  { text: "text-ink-info", bg: "bg-tone-info/15", border: "border-tone-info", dot: "bg-ink-info", cssVar: "var(--color-ink-info)" },
  { text: "text-ink-arcane", bg: "bg-tone-arcane/15", border: "border-tone-arcane", dot: "bg-ink-arcane", cssVar: "var(--color-ink-arcane)" },
];

export function threadTone(index: number): ThreadTone {
  return TONES[((index % TONES.length) + TONES.length) % TONES.length]!;
}

/** Everything a surface needs to draw one thread, in one lookup. */
export interface ThreadBadge<T extends ThreadLike = ThreadLike> {
  thread: T;
  index: number;
  letter: string;
  tone: ThreadTone;
}

export function threadBadges<T extends ThreadLike>(threads: readonly T[]): ThreadBadge<T>[] {
  return orderThreads(threads).map((thread, index) => ({ thread, index, letter: threadLetter(index), tone: threadTone(index) }));
}

export function threadBadge<T extends ThreadLike>(threads: readonly T[], threadId: string): ThreadBadge<T> | null {
  return threadBadges(threads).find((badge) => badge.thread.id === threadId) ?? null;
}

/** The thread a surface lands on when the route names none: the oldest live one. */
export function defaultThreadId(threads: readonly ThreadLike[]): string | null {
  const first = orderThreads(threads).find((thread) => thread.status === "live" || thread.status === "waiting");
  return first?.id ?? null;
}

/** "A · The petition" — the label form the thread bar and the rail rows use. */
export function threadTitle(badge: Pick<ThreadBadge, "letter" | "thread">): string {
  return `${badge.letter} · ${badge.thread.label}`;
}
