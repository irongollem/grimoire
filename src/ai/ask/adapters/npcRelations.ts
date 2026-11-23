/**
 * Ask Grimoire (#1253): the words a DM uses for what a new NPC is to an existing one, mapped onto the NPC page's own
 * two pickers. The page offers family (`GENERATOR_KIN_RELATIONS`, written to the kinship table) and "known associate"
 * (`ASSOCIATE_CHOICES`, written as a world link), and Ask's one `relation` word chooses between them, so an NPC made
 * through Ask lands in exactly the rows the page would write.
 *
 * Read from the new NPC, like the page: "mentor" is the NPC mentoring the other, "apprentice" the reverse. A word is
 * tied to an associate choice by the catalogue's own key and direction, so a renamed catalogue key fails here at load
 * instead of linking the wrong way; `npcRelations.test.ts` holds the table equal to the catalogue's choices.
 */
import { DEFAULT_ASSOCIATE, associateById } from "@/lib/npcGenerator/associate";
import { GENERATOR_KIN_LABELS, isGeneratorKin, type GeneratorKinRelation } from "@/lib/npcGenerator/kinPrompt";
import type { TypeChoice } from "@/lib/worldLinks/connections";

/** Each associate word and the catalogue choice (`key:subjectIsFrom`) it stands for. */
export const ASSOCIATE_WORDS: Record<string, string> = {
  friend: "friend:true",
  ally: "ally:true",
  lover: "lover:true",
  contact: "contact:true",
  rival: "rival:true",
  enemy: "enemy:true",
  mentor: "mentor_of:true",
  apprentice: "mentor_of:false",
  superior: "superior_of:true",
  subordinate: "superior_of:false",
  chosen_family: "chosen_family:true",
  former_ally: "former_ally:true",
  former_enemy: "former_enemy:true",
  employer: "employer_of:true",
  employee: "employer_of:false",
  patron: "patron_of:true",
  protege: "patron_of:false",
  creditor: "creditor_of:true",
  debtor: "creditor_of:false",
  blackmailer: "blackmails:true",
  blackmailed_by: "blackmails:false",
  betrayed: "betrayed:true",
  betrayed_by: "betrayed:false",
  sworn_to: "sworn_to:true",
  holds_oath_of: "sworn_to:false",
};

export type NpcRelation =
  | { kind: "kin"; kin: GeneratorKinRelation; label: string }
  | { kind: "tie"; choice: TypeChoice; label: string };

/** "betrayed by" as a quote label. */
function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What the DM's word means on the page, or null for a word that is not one of the contract's. */
export function npcRelation(word: string | null): NpcRelation | null {
  if (word === null) return null;
  if (isGeneratorKin(word)) return { kind: "kin", kin: word, label: GENERATOR_KIN_LABELS[word] };
  const id = ASSOCIATE_WORDS[word];
  if (id === undefined) return null;
  const choice = associateById(id);
  return choice ? { kind: "tie", choice, label: capitalised(choice.word) } : null;
}

/** A related person named with no relation: the page's own default tie, the loosest one. */
export const DEFAULT_RELATION: NpcRelation = { kind: "tie", choice: DEFAULT_ASSOCIATE, label: capitalised(DEFAULT_ASSOCIATE.word) };
