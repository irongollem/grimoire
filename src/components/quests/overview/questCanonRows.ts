import { clockFilled } from "@/composables/canon/useCanonForces";
import { FORCE_OUTCOME_ENDED, forceOutcome } from "@/lib/canon/canonClose";
import { SECRET_STATE_LABEL, secretState } from "@/lib/canon/canonSecrets";
import { QUEST_LINKED_PARTS, type CanonClue, type CanonEntry, type CanonEntryQuest, type CanonForceTick, type QuestLinkedPart } from "@/types/canon.types";

/**
 * What a quest's page lists as "The canon behind this quest" (#1255 item 12): the entries tied to it, grouped by part in
 * the order a DM thinks of them, each with the one quiet fact that says where it stands. Pure, so the block and its
 * tests agree on all of it.
 */

export interface QuestCanonRow {
  /** The link row, which Unlink deletes. */
  linkId: string;
  entryId: string;
  /** A backstory is named for its character; every other part by its title. */
  name: string;
  /** A force's clock or ending, a secret's state; nothing for the others. */
  fact: string | null;
}

export interface QuestCanonGroup {
  part: QuestLinkedPart;
  title: string;
  rows: QuestCanonRow[];
}

export const QUEST_CANON_GROUP_TITLE: Record<QuestLinkedPart, string> = {
  force: "Forces",
  secret: "Secrets",
  truth: "Truths",
  lore: "Lore",
  backstory: "Backstories",
};

export interface QuestCanonInput {
  questId: string;
  links: readonly CanonEntryQuest[];
  entries: readonly CanonEntry[];
  ticks: readonly CanonForceTick[];
  clues: readonly CanonClue[];
  /** party member id to name, for a backstory. */
  characterNames: ReadonlyMap<string, string>;
}

const isLinkedPart = (part: CanonEntry["part"]): part is QuestLinkedPart => (QUEST_LINKED_PARTS as readonly string[]).includes(part);

function nameOf(entry: CanonEntry, characterNames: ReadonlyMap<string, string>): string {
  if (entry.part === "backstory" && entry.party_member_id !== null) {
    const character = characterNames.get(entry.party_member_id);
    if (character !== undefined) return character;
  }
  return entry.title.trim() === "" ? "Untitled" : entry.title;
}

function factOf(entry: CanonEntry, input: QuestCanonInput): string | null {
  if (entry.part === "force") {
    const outcome = forceOutcome(entry);
    if (outcome !== null) return FORCE_OUTCOME_ENDED[outcome];
    if (entry.clock_size === null) return null;
    return `${clockFilled(input.ticks.filter((t) => t.force_id === entry.id), entry.clock_size)} of ${entry.clock_size}`;
  }
  if (entry.part === "secret") return SECRET_STATE_LABEL[secretState(entry, input.clues.filter((c) => c.secret_id === entry.id))];
  return null;
}

/** The entries tied to the quest, grouped by part (empty groups left out), each group in the order the links were made. */
export function questCanonGroups(input: QuestCanonInput): QuestCanonGroup[] {
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  const rows = new Map<QuestLinkedPart, QuestCanonRow[]>();
  for (const link of input.links) {
    if (link.quest_id !== input.questId) continue;
    const entry = byId.get(link.entry_id);
    if (entry === undefined || !isLinkedPart(entry.part)) continue;
    const row: QuestCanonRow = { linkId: link.id, entryId: entry.id, name: nameOf(entry, input.characterNames), fact: factOf(entry, input) };
    rows.set(entry.part, [...(rows.get(entry.part) ?? []), row]);
  }
  return QUEST_LINKED_PARTS.flatMap((part) => {
    const inPart = rows.get(part);
    return inPart === undefined ? [] : [{ part, title: QUEST_CANON_GROUP_TITLE[part], rows: inPart }];
  });
}

/** The entries the picker offers: those of the five parts not yet tied to this quest. */
export function questCanonOptions(input: Pick<QuestCanonInput, "questId" | "links" | "entries" | "characterNames">): { id: string; name: string }[] {
  const tied = new Set(input.links.filter((l) => l.quest_id === input.questId).map((l) => l.entry_id));
  return input.entries
    .filter((e) => isLinkedPart(e.part) && !tied.has(e.id))
    .map((e) => ({ id: e.id, name: nameOf(e, input.characterNames) }));
}
