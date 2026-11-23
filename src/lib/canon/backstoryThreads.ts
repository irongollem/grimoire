import type { CanonEntry } from "@/types/canon.types";
import type { WorldLink } from "@/types/connections.types";

/**
 * The threads a backstory leaves open (#1255 item 13): the open questions and unrevealed secrets tied to the backstory
 * entry by a canon-to-canon link (`related_to` or `led_to`, from either end). A question that has been answered and a
 * secret that has been revealed are no longer open, so they leave the list.
 */

export type BackstoryThreadLink = Pick<WorldLink, "from_kind" | "from_id" | "to_kind" | "to_id" | "type">;

/** The link types that tie one canon entry to another. */
export const THREAD_LINK_TYPES = ["related_to", "led_to"] as const;

export function isOpenThread(entry: Pick<CanonEntry, "part" | "closed_as" | "revealed_at">): boolean {
  return (entry.part === "question" && entry.closed_as === null) || (entry.part === "secret" && entry.revealed_at === null);
}

/** A question or a secret: the two parts a thread can be. */
const isThreadPart = (entry: Pick<CanonEntry, "part">) => entry.part === "question" || entry.part === "secret";

/** The ids of the canon entries tied to a backstory by a thread link (either end). */
function tiedIds(backstoryId: string, links: readonly BackstoryThreadLink[]): Set<string> {
  const tied = new Set<string>();
  for (const link of links) {
    if (link.from_kind !== "canon" || link.to_kind !== "canon") continue;
    if (!(THREAD_LINK_TYPES as readonly string[]).includes(link.type)) continue;
    if (link.from_id === backstoryId) tied.add(link.to_id);
    else if (link.to_id === backstoryId) tied.add(link.from_id);
  }
  return tied;
}

/** Every thread of a backstory, open or paid off: the questions and secrets tied to it, in the DM's order, each once. */
export function allThreads(backstoryId: string, entries: readonly CanonEntry[], links: readonly BackstoryThreadLink[]): CanonEntry[] {
  const tied = tiedIds(backstoryId, links);
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
