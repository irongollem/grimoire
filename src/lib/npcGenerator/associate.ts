/**
 * The tie the generator's "known associate" picker offers (#1084): every link
 * type two people can hold, read from the NPC being made ("friend of",
 * "mentor of", "apprentice of"), straight from the catalogue. Kin is not here;
 * it keeps its own group (`kinPrompt`) and its own write.
 */
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";

export const ASSOCIATE_CHOICES: readonly TypeChoice[] = typeChoices("npc", "npc").filter((c) => c.home === undefined);

/** A choice as an option value: the catalogue key and the direction it is stored in. */
export function associateId(choice: Pick<TypeChoice, "key" | "subjectIsFrom">): string {
  return `${choice.key}:${choice.subjectIsFrom}`;
}

const contact = ASSOCIATE_CHOICES.find((c) => c.key === "contact");
if (!contact) throw new Error("The catalogue has no contact tie between two people");

/** The loosest tie, what a new associate starts as. */
export const DEFAULT_ASSOCIATE: TypeChoice = contact;

export function associateById(id: string): TypeChoice | null {
  return ASSOCIATE_CHOICES.find((c) => associateId(c) === id) ?? null;
}
