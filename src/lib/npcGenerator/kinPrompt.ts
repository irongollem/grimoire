import { completedYears } from "@edge-shared/npcAge";
import type { KinLink, KinRelation, PersonKey } from "@/types/kinship.types";
import { linkEnds, parsePersonKey } from "@/lib/kinship/keys";

/** The kin choices the generator offers, as what the NEW NPC is to the associate. */
export const GENERATOR_KIN_RELATIONS = ["child", "parent", "spouse", "sibling"] as const satisfies readonly KinRelation[];
export type GeneratorKinRelation = (typeof GENERATOR_KIN_RELATIONS)[number];

export const GENERATOR_KIN_LABELS: Record<GeneratorKinRelation, string> = {
  child: "Child of",
  parent: "Parent of",
  spouse: "Spouse of",
  sibling: "Sibling of",
};

export function isGeneratorKin(v: unknown): v is GeneratorKinRelation {
  return typeof v === "string" && (GENERATOR_KIN_RELATIONS as readonly string[]).includes(v);
}

/** A person key from a URL, or null when it is not one. */
export function parseKinQueryKey(v: unknown): PersonKey | null {
  if (typeof v !== "string") return null;
  const m = /^(npc|pc):[0-9a-fA-F-]{8,}$/.exec(v);
  return m ? (v as PersonKey) : null;
}

/**
 * The "Add relative" link, `/npcs?kin=<child|parent|spouse|sibling>&of=<npc:id|pc:id>&also=<npc:id|pc:id>` (`kin` is what
 * the new NPC is to `of`; `also` is the second parent of a child), as the NPC card's inputs. Null when the link does not
 * name a relative, so a stray `kin` opens nothing.
 */
export function kinCardInputs(query: { kin?: unknown; of?: unknown; also?: unknown }): Record<string, string> | null {
  const { kin } = query;
  if (!isGeneratorKin(kin)) return null;
  const of = parseKinQueryKey(query.of);
  if (!of) return null;
  const { type, id } = parsePersonKey(of);
  const also = kin === "child" ? parseKinQueryKey(query.also) : null;
  return {
    [type === "npc" ? "related_npc_id" : "related_pc_id"]: id,
    relation: kin,
    ...(also ? { second_parent_id: parsePersonKey(also).id } : {}),
  };
}

/** The one current spouse of `key`, or null when there are none or several. */
export function onlySpouseOf(links: KinLink[], key: PersonKey): PersonKey | null {
  const spouses: PersonKey[] = [];
  for (const l of links) {
    if (l.kind !== "spouse") continue;
    const { from, to } = linkEnds(l);
    if (from === key) spouses.push(to);
    else if (to === key) spouses.push(from);
  }
  return spouses.length === 1 ? spouses[0] : null;
}

export interface PromptPerson {
  name: string;
  bornYear: number | null;
  /** Their people (an NPC's race), so blood kin are made of the same one; null when not known. */
  species: string | null;
}

function describe(p: PromptPerson, todayYear: number | null): string {
  const facts: string[] = [];
  if (p.species) facts.push(p.species);
  if (p.bornYear !== null) {
    const age = todayYear === null ? null : completedYears({ year: p.bornYear, month: null, day: null }, { year: todayYear, month: 1, day: 1 });
    facts.push(age === null ? `born ${p.bornYear}` : `born ${p.bornYear}, ${age} now`);
  }
  return facts.length === 0 ? p.name : `${p.name} (${facts.join(", ")})`;
}

const RELATION_WORDS: Record<GeneratorKinRelation, string> = {
  child: "child",
  parent: "parent",
  spouse: "spouse",
  sibling: "sibling",
};

/**
 * One plain, directional sentence for the generator: the new NPC is the
 * <relation> of these people, with the years that let the model pick an age.
 */
export function kinPromptLine(relation: GeneratorKinRelation, others: PromptPerson[], todayYear: number | null): string {
  const names = others.map((p) => describe(p, todayYear));
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const year = todayYear === null ? "" : ` The current year is ${todayYear}.`;
  // A live run made a halfling's younger sister human (23 Nov 2026): the relative's people was never said.
  const people = relation === "spouse" ? "" : " Unless the request says otherwise, they are of the same people as their blood kin.";
  return `The new NPC is the ${RELATION_WORDS[relation]} of ${who}.${year} Give an age that fits.${people}`;
}
