import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { Activity, LivesAs, Species, SpeciesForm } from "@/lib/canon/ecologyTypes";
import { DEFAULT_FORM_LABEL } from "@/lib/canon/fieldGuide";

/** The monster card's concept box takes this many characters. */
export const MONSTER_CONCEPT_MAX = 1000;

const LIVES: Record<LivesAs, string> = {
  alone: "lives alone",
  pairs: "lives in pairs",
  family: "lives in family groups",
  harem: "lives in harems",
  herd: "lives in herds",
  colony: "lives in colonies",
};

const ACTIVE: Record<Activity, string | null> = {
  day: "It is about by day.",
  twilight: "It is about at dawn and dusk.",
  night: "It is about by night.",
  any: null,
};

/** What the monster card is opened with for one form of a species: the concept, and the inputs the species settles. */
export interface StatBlockRequest {
  concept: string;
  inputs: Record<string, unknown>;
}

/**
 * A species and one of its forms, said as a request for a stat block: its name, what it is, the form's stage, how it
 * lives and when it is about. Size and challenge rating are left to the card. The species' own description is cut
 * first when the whole would overrun the concept box.
 */
export function statBlockRequest(species: Pick<Species, "name" | "kingdom" | "livesAs" | "activity" | "description">, form: Pick<SpeciesForm, "label" | "domesticated">): StatBlockRequest {
  const kind = species.kingdom === "other" ? "creature" : species.kingdom;
  const stage = form.label.trim().toLowerCase() === DEFAULT_FORM_LABEL.toLowerCase() ? "" : `${form.label.trim()} `;
  const head = `A stat block for the ${stage}${species.name} (${kind}) of my world${form.domesticated ? ", a kind that people keep" : ""}.`;
  const tail = [species.livesAs === null ? null : `It ${LIVES[species.livesAs]}.`, species.activity === null ? null : ACTIVE[species.activity]].filter((s): s is string => s !== null).join(" ");
  const room = MONSTER_CONCEPT_MAX - head.length - tail.length - 2;
  const described = tiptapToPlainText(species.description).trim().replace(/\s+/g, " ");
  const description = room > 0 && described !== "" ? (described.length > room ? `${described.slice(0, room - 1).trimEnd()}…` : described) : "";
  const concept = [head, description, tail].filter((s) => s !== "").join(" ");
  // A plant or a fungus is a plant to the rules; an animal is a beast; anything else is the DM's to say.
  const monsterType = species.kingdom === "animal" ? "beast" : species.kingdom === "plant" || species.kingdom === "fungus" ? "plant" : null;
  return { concept, inputs: monsterType === null ? {} : { monster_type: monsterType } };
}
