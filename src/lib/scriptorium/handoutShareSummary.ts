import type {
  HandoutRevealed,
  HandoutWithheld,
  HandoutWithheldReason,
} from "@/types/scriptorium.types";

/**
 * Plain-words wording for the handout share confirmation (#970). The dry run of
 * `share_handout` reports what would change; this turns each row into a line a
 * DM can read before they hand a document to players.
 */

export interface SummaryLine {
  /** The entry's name. */
  name: string;
  /** What players gain from it, e.g. "name (seen as The Almoner)". */
  detail: string;
}

function humanizeField(field: string): string {
  return field.replace(/_/g, " ");
}

export function describeRevealed(entry: HandoutRevealed): SummaryLine {
  switch (entry.type) {
    case "npc": {
      const fields = entry.fields.length ? entry.fields.map(humanizeField).join(", ") : "discovered";
      return {
        name: entry.name,
        detail: entry.seen_as ? `${fields} (seen as ${entry.seen_as})` : fields,
      };
    }
    case "location":
      return {
        name: entry.name,
        detail: entry.description ? "discovered, with its description" : "discovered",
      };
    case "quest":
      return { name: entry.name, detail: entry.starts ? "the quest starts" : "the quest is shown" };
    case "monster":
      return {
        name: entry.name,
        detail: entry.stats ? "discovered, with its stat block" : "discovered",
      };
  }
}

const WITHHELD_REASON: Record<HandoutWithheldReason, string> = {
  not_revealed: "set not to reveal",
  found_only: "shown once the party has it",
  outside_campaign: "from another campaign",
};

export function describeWithheld(entry: HandoutWithheld): SummaryLine {
  return {
    name: entry.name ?? `A linked ${entry.type}`,
    detail: WITHHELD_REASON[entry.reason],
  };
}

/** "Mira", "Mira and Tor", "Mira, Tor and Ash"; the whole party says so. */
export function describeRecipients(names: readonly string[], partySize: number): string {
  if (names.length === 0) return "No one";
  if (partySize > 0 && names.length === partySize && names.length > 1) return "The whole party";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 linked entry is hidden from players" for the pending-reveal banner. */
export function describePending(count: number): string {
  return count === 1
    ? "1 linked entry is hidden from players."
    : `${count} linked entries are hidden from players.`;
}
