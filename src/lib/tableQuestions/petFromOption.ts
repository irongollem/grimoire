import type { CompanionInsert } from "@/types/companion.types";
import type { TableQuestionOption } from "@/types/tableQuestion.types";

/** Only a picked creature can become a pet; an item, or a plain entry, cannot. */
export function canBePet(option: TableQuestionOption): boolean {
  return option.ref?.kind === "monster";
}

/**
 * The companion row for "Make it {Name}'s pet", built as CompanionForm builds a
 * pet from a monster. The stats are placeholders the DM can tune: the point is
 * that the pet exists on the sheet and shows its picture. A pet never fights, so
 * it is never combat-ready (the database refuses a ready pet, #1115).
 */
export function petFromOption(
  option: TableQuestionOption,
  ownerPartyMemberId: string,
): Omit<CompanionInsert, "campaign_id"> | null {
  if (option.ref?.kind !== "monster") return null;
  return {
    name: option.label,
    companion_type: "pet",
    source_type: "monster",
    source_monster_id: option.ref.id,
    source_npc_id: null,
    owner_party_member_id: ownerPartyMemberId,
    combat_ready: false,
    max_hp: 1,
    current_hp: 1,
    ac: 10,
    speed: 30,
    conditions: [],
    sort_order: 0,
    portrait_url: option.image_url,
    portrait_focal_point: option.focal,
    stat_block: null,
  };
}
