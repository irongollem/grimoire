import type { TableQuestionAnswer, TableQuestionOption } from "@/types/tableQuestion.types";

/** What a player is told a gift gave them, and where to go and see it. */
export interface GiftReceived {
  text: string;
  to: string;
  link: string;
}

/**
 * The line under a gift question once it has given something (#1212 story 7). It
 * reads what the database wrote on the answer, never the option alone: a pick of
 * a plain-text option gives nothing, and a reward the DM since took back is gone.
 */
export function giftReceived(
  option: Pick<TableQuestionOption, "label" | "ref">,
  answer: Pick<TableQuestionAnswer, "companion_id" | "inventory_item_id">,
  characterName: string,
): GiftReceived | null {
  if (answer.inventory_item_id !== null) {
    return { text: `${option.label} is in ${characterName}'s pack.`, to: "/play/inventory", link: "See the pack" };
  }
  if (answer.companion_id !== null) {
    const text = option.ref?.kind === "npc"
      ? `${option.label} joins ${characterName}'s company.`
      : `${option.label} is ${characterName}'s now.`;
    return { text, to: "/play/party", link: "See the company" };
  }
  return null;
}
