import type { RollTable } from "@/types/rollTable.types";
import type { TableQuestionInsert, TableQuestionMode, TableQuestionOption } from "@/types/tableQuestion.types";
import type { CampaignMember } from "@/types/campaign.types";
import type { TableQuestionAnswer } from "@/types/tableQuestion.types";

export interface SendChoices {
  campaignId: string;
  table: Pick<RollTable, "id" | "dice">;
  prompt: string;
  mode: TableQuestionMode;
  /** The pick switch: only one of each at this table. */
  exclusive: boolean;
  /** The vote switch: hide votes until the DM closes it. */
  hidden: boolean;
  /** The pick switch: what they pick is theirs to keep. */
  gift: boolean;
  options: TableQuestionOption[];
}

/**
 * The row a send inserts. The database refuses `exclusive` and `gift` outside
 * a pick, `hidden` outside a vote and a die on anything but a roll, so a switch left
 * on from another mode is dropped here instead of failing the insert.
 */
export function buildSendPayload(c: SendChoices): TableQuestionInsert {
  return {
    campaign_id: c.campaignId,
    roll_table_id: c.table.id,
    prompt: c.prompt.trim(),
    mode: c.mode,
    dice: c.mode === "roll" ? c.table.dice : null,
    exclusive: c.mode === "pick" && c.exclusive,
    hidden: c.mode === "vote" && c.hidden,
    gift: c.mode === "pick" && c.gift,
    options: c.options,
  };
}

/** A question can go out when it has words and at least one option to answer with. */
export function canSend(prompt: string, options: readonly TableQuestionOption[]): boolean {
  return prompt.trim().length > 0 && options.length > 0;
}

/**
 * Who an answer belongs to: the character's name when the answer names one,
 * else the member's display name, else a plain "A player".
 */
export function answererName(
  answer: Pick<TableQuestionAnswer, "user_id" | "party_member_id">,
  members: readonly Pick<CampaignMember, "user_id" | "display_name">[],
  characters: readonly { id: string; name: string }[],
): string {
  if (answer.party_member_id) {
    const character = characters.find((p) => p.id === answer.party_member_id);
    if (character) return character.name;
  }
  const member = members.find((m) => m.user_id === answer.user_id);
  return member?.display_name ? member.display_name : "A player";
}
