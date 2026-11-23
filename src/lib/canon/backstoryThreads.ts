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

/** The open threads of one backstory entry, in the order the entries are in (the DM's order), each once. */
export function openThreads(backstoryId: string, entries: readonly CanonEntry[], links: readonly BackstoryThreadLink[]): CanonEntry[] {
  const tied = new Set<string>();
  for (const link of links) {
    if (link.from_kind !== "canon" || link.to_kind !== "canon") continue;
    if (!(THREAD_LINK_TYPES as readonly string[]).includes(link.type)) continue;
    if (link.from_id === backstoryId) tied.add(link.to_id);
    else if (link.to_id === backstoryId) tied.add(link.from_id);
  }
  return entries.filter((e) => tied.has(e.id) && isOpenThread(e));
}
