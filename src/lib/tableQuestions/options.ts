import type { EntryRef, TableQuestionOption } from "@/types/tableQuestion.types";
import type { RollTableEntry } from "@/types/rollTable.types";

/** The key a picture is looked up by: kind and id, since a monster and an item may share an id. */
export function entryRefKey(ref: EntryRef): string {
  return `${ref.kind}:${ref.id}`;
}

export interface EntryPicture {
  name: string;
  image_url: string | null;
  focal: { x: number; y: number } | null;
}

/**
 * The snapshot a question carries: one option per entry, in entry order. Players
 * read this instead of the DM-only roll table, so nothing private goes in: DM
 * notes are never copied, and an NPC ref only goes into a gift, where the NPC
 * joins the party (elsewhere its id has no use to a player, and a disguised
 * NPC's would say more than its picture). An entry with a blank label is
 * skipped, the database refuses one.
 */
export function buildQuestionOptions(
  entries: readonly RollTableEntry[],
  pictures: ReadonlyMap<string, EntryPicture>,
  { gift }: { gift: boolean },
): TableQuestionOption[] {
  const options: TableQuestionOption[] = [];
  for (const entry of entries) {
    const label = entry.label.trim();
    if (!label) continue;
    const picture = entry.ref ? pictures.get(entryRefKey(entry.ref)) : undefined;
    const blurb = entry.blurb?.trim();
    options.push({
      id: entry.id,
      label,
      blurb: blurb ? blurb : null,
      image_url: picture?.image_url ?? null,
      focal: picture?.focal ?? null,
      ref: entry.ref && (gift || entry.ref.kind !== "npc") ? { kind: entry.ref.kind, id: entry.ref.id } : null,
      min: entry.min,
      max: entry.max,
    });
  }
  return options;
}
