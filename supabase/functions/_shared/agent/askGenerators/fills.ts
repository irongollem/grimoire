// Ask Grimoire: Generators that fill an existing record, and the Canon's suggestions.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";

export const FILLS_GENERATORS: readonly AskGenerator[] = [
  { id: "portrait", action: "Paint portrait", noun: "portrait", ending: "fill", describe: "A picture for an existing NPC, party member, monster, item or spell.", inputs: {}, target: ["npc", "party_member", "monster", "item", "spell"] },
  { id: "quest_beat", action: "Write beat", noun: "quest", ending: "fill", describe: "Write a quest beat's title, read-aloud and DM text.", inputs: {}, target: ["quest_beat"] },
  { id: "room", action: "Describe room", noun: "place", ending: "fill", describe: "Describe a room in a site.", inputs: {}, target: ["room"] },
  { id: "canon_suggestions", action: "Suggest canon", noun: "canon", ending: "review", describe: "Suggested truths, lore or secrets for the campaign's canon.", inputs: {} },
];
