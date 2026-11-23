import { clockFilled } from "@/lib/canon/canonForces";
import { FORCE_OUTCOME_ENDED, forceOutcome } from "@/lib/canon/canonClose";
import type { CanonEntry, CanonForceTick } from "@/types/canon.types";
import type { Connection } from "@/types/connections.types";

/**
 * "What it is moving" on a faction's page (#1255 item 12): the forces that are `about` this faction. A force is tied to
 * its faction by an `about` link from its canon entry, so they are the faction's canon connections whose entry is a
 * force. A truth or a secret about the faction is also an `about` link and is not listed here.
 */

export interface FactionForceRow {
  entryId: string;
  title: string;
  wants: string | null;
  /** The clock ("3 of 6"), or how it ended; null when it has neither. */
  status: string | null;
}

export function factionForces(connections: readonly Connection[], entries: readonly CanonEntry[], ticks: readonly CanonForceTick[]): FactionForceRow[] {
  const aboutIds = new Set(connections.filter((c) => c.type === "about" && c.other_kind === "canon").map((c) => c.other_id));
  return entries
    .filter((e) => e.part === "force" && aboutIds.has(e.id))
    .map((e) => {
      const outcome = forceOutcome(e);
      const status = outcome !== null ? FORCE_OUTCOME_ENDED[outcome] : e.clock_size === null ? null : `${clockFilled(ticks.filter((t) => t.force_id === e.id), e.clock_size)} of ${e.clock_size}`;
      const wants = e.wants === null || e.wants.trim() === "" ? null : e.wants;
      return { entryId: e.id, title: e.title, wants, status };
    });
}
