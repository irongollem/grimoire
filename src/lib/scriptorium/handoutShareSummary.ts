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
    case "deity":
    case "faction":
      return { name: entry.name, detail: "shared" };
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

/** "Mira", "Mira and Tor", "Mira, Tor and Ash". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Who holds a handout, as the end of a sentence: "Pip and Wren", "the whole
 * party", "no one". A one-person party is named, not "the whole party".
 */
export function describeHolders(names: readonly string[], partySize: number): string {
  if (names.length === 0) return "no one";
  if (partySize > 0 && names.length === partySize && names.length > 1) return "the whole party";
  return joinNames(names);
}

/**
 * The footer of the Give dialog: what the ticks change for each player, from the
 * dry run. "Bramble is new; Pip and Wren already have it."
 */
export function describeAudienceChange(change: {
  added: readonly string[];
  kept: readonly string[];
  removed: readonly string[];
}): string {
  const parts: string[] = [];
  if (change.added.length) parts.push(`${joinNames(change.added)} ${change.added.length === 1 ? "is" : "are"} new`);
  if (change.kept.length) parts.push(`${joinNames(change.kept)} already ${change.kept.length === 1 ? "has" : "have"} it`);
  if (change.removed.length) parts.push(`${joinNames(change.removed)} will no longer have it`);
  return parts.length ? `${parts.join("; ")}.` : "";
}

/**
 * The handout editor's audience line, for linked entries a holder still cannot
 * see: "The Bell-Mother is linked but hidden from them." Past two names it
 * counts instead of listing.
 */
export function describeHiddenFromHolders(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is linked but hidden from them.`;
  if (names.length === 2) return `${joinNames(names)} are linked but hidden from them.`;
  return `${names.length} linked entries are hidden from them.`;
}
