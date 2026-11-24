// Ask Grimoire: pieces several generators' inputs share. Pure data, imported by the generator modules beside it.
import type { AskInputSchema } from "../askContract.ts";

/** The ties an NPC may be given beyond the kin and associate inputs: any kind the catalogue holds for a person. */
export const npcLinks = {
  type: "links",
  description: "Ties to existing records of this campaign (a god they worship, a place they work at, a faction's ally, an item they seek, a party member they are bonded to). Each is {kind, id, relation}; relation is what the NEW NPC is to that record, read from the NPC. Use this for any tie that has no input of its own above.",
  subject: "npc",
  kinds: ["npc", "party_member", "faction", "location", "deity", "item", "canon"],
} as const satisfies AskInputSchema;

/** Ties a made record may be given to existing records, read from the new record; one per generator that makes a linkable kind. */
export function linksFor(subject: "faction" | "location" | "deity" | "item", what: string): AskInputSchema {
  return {
    type: "links",
    description: `Ties to existing records of this campaign (${what}). Each is {kind, id, relation}; relation is what the NEW ${subject === "location" ? "place" : subject} is to that record, read from it. Use this for any tie that has no input of its own above.`,
    subject,
    kinds: ["npc", "party_member", "faction", "location", "deity", "item", "canon"],
  };
}

export const image = { type: "boolean", description: "Paint a picture of it as well. Costs extra; ask unless the DM said." } as const;

/**
 * What the NEW NPC is to an existing one, in the words a DM says it. The first four are kin (the page's family tie, written
 * to the kinship table); the rest are the associate ties (the page's "known associate", written as a world link). Read
 * from the new NPC: "mentor" means the new NPC is the mentor, "apprentice" that they are the apprentice. The adapter maps
 * each word to the page's own choice and `askContract.test.ts` holds the list equal to the catalogue's choices.
 */
export const NPC_RELATIONS = [
  "child", "parent", "spouse", "sibling",
  "friend", "ally", "lover", "contact", "rival", "enemy", "mentor", "apprentice", "superior", "subordinate",
  "chosen_family", "former_ally", "former_enemy", "employer", "employee", "patron", "protege", "creditor", "debtor",
  "blackmailer", "blackmailed_by", "betrayed", "betrayed_by", "sworn_to", "holds_oath_of",
] as const;
