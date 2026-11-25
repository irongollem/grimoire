import { THREAD_LINK_TYPES, isOpenThread, threadTiedIds } from "@edge-shared/canonLooseEnds.ts";
import type { CanonEntry } from "@/types/canon.types";
import type { WorldLink } from "@/types/connections.types";

/**
 * The threads a backstory leaves open (#1255 item 13): the open questions and unrevealed secrets tied to the backstory
 * entry by a canon-to-canon link (`related_to` or `led_to`, from either end). A question that has been answered and a
 * secret that has been revealed are no longer open, so they leave the list.
 */

export type BackstoryThreadLink = Pick<WorldLink, "from_kind" | "from_id" | "to_kind" | "to_id" | "type">;

/** The rule is the loose-ends module's, shared with Tonight and the read-through, so the three never disagree. */
export { THREAD_LINK_TYPES, isOpenThread };

/** A question or a secret: the two parts a thread can be. */
const isThreadPart = (entry: Pick<CanonEntry, "part">) => entry.part === "question" || entry.part === "secret";

/** Every thread of a backstory, open or paid off: the questions and secrets tied to it, in the DM's order, each once. */
export function allThreads(backstoryId: string, entries: readonly CanonEntry[], links: readonly BackstoryThreadLink[]): CanonEntry[] {
  const tied = threadTiedIds(backstoryId, links);
  return entries.filter((e) => tied.has(e.id) && isThreadPart(e));
}

/** The open threads of one backstory entry, in the order the entries are in (the DM's order), each once. */
export function openThreads(backstoryId: string, entries: readonly CanonEntry[], links: readonly BackstoryThreadLink[]): CanonEntry[] {
  return allThreads(backstoryId, entries, links).filter(isOpenThread);
}

/** The threads that were paid off: a question answered, a secret revealed. */
export function paidOffThreads(backstoryId: string, entries: readonly CanonEntry[], links: readonly BackstoryThreadLink[]): CanonEntry[] {
  return allThreads(backstoryId, entries, links).filter((e) => !isOpenThread(e));
}

/**
 * True for a connection row that is one of the backstory's threads. The thread list shows these (open or paid off), so
 * the entry's Connections block leaves them out instead of listing the same question twice.
 */
export function isThreadTie(
  row: { source: string; type: string; other_kind: string; other_id: string },
  threadIds: ReadonlySet<string>,
): boolean {
  return row.source === "link" && row.other_kind === "canon" && (THREAD_LINK_TYPES as readonly string[]).includes(row.type) && threadIds.has(row.other_id);
}
