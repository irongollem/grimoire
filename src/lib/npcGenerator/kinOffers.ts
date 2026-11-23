/**
 * The rest of a family, offered when a new NPC joins it (#1253). Making someone a parent of Tam says nothing about
 * Tam's sister Nella: half-siblings exist, so it is never assumed. The NPC generator's page and Ask both offer each
 * such person as a yes or no that starts at no (maintainer, 23 Nov 2026: "a UI that allows yes/no on everything
 * that edits existing state"), and the workflow writes only the ones the DM ticks.
 *
 * What is offered, read from the new NPC:
 * - a parent of X: also a parent of X's siblings (by a sibling link or a shared parent);
 * - a sibling of X: also a child of X's parents (so a sibling of all their children), and a sibling of X's siblings
 *   linked as such;
 * - a spouse of X: also a parent of X's children (a step-parent is a parent the DM ticks, or does not).
 * A child of X has its own second-parent field, so it is offered nothing here.
 */
import { linkEnds } from "@/lib/kinship/keys";
import type { GeneratorKinRelation } from "@/lib/npcGenerator/kinPrompt";
import type { KinLink, PersonKey } from "@/types/kinship.types";

export interface KinOffer {
  /** The person already in the campaign. */
  key: PersonKey;
  /** What the new NPC would be to them. */
  relation: GeneratorKinRelation;
}

type Ends = Pick<KinLink, "kind" | "from_npc_id" | "from_party_member_id" | "to_npc_id" | "to_party_member_id">;

function parentsOf(links: readonly Ends[], key: PersonKey): PersonKey[] {
  return links.filter((l) => l.kind === "parent").map(linkEnds).filter((e) => e.to === key).map((e) => e.from);
}

function childrenOf(links: readonly Ends[], key: PersonKey): PersonKey[] {
  return links.filter((l) => l.kind === "parent").map(linkEnds).filter((e) => e.from === key).map((e) => e.to);
}

function linkedSiblingsOf(links: readonly Ends[], key: PersonKey): PersonKey[] {
  const out: PersonKey[] = [];
  for (const l of links) {
    if (l.kind !== "sibling") continue;
    const { from, to } = linkEnds(l);
    if (from === key) out.push(to);
    else if (to === key) out.push(from);
  }
  return out;
}

/**
 * Who else the new NPC could be family to, in a stable order, never the relative, never anyone in `exclude` (the
 * second parent the DM already chose), each person once.
 */
export function kinOffers(
  links: readonly Ends[],
  relative: PersonKey,
  relation: GeneratorKinRelation,
  exclude: readonly PersonKey[] = [],
): KinOffer[] {
  const offers: KinOffer[] = [];
  const seen = new Set<PersonKey>([relative, ...exclude]);
  const offer = (key: PersonKey, as: GeneratorKinRelation) => {
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({ key, relation: as });
  };
  if (relation === "parent") {
    for (const s of linkedSiblingsOf(links, relative)) offer(s, "parent");
    for (const p of parentsOf(links, relative)) for (const c of childrenOf(links, p)) offer(c, "parent");
  } else if (relation === "sibling") {
    for (const p of parentsOf(links, relative)) offer(p, "child");
    for (const s of linkedSiblingsOf(links, relative)) offer(s, "sibling");
  } else if (relation === "spouse") {
    for (const c of childrenOf(links, relative)) offer(c, "parent");
  }
  return offers;
}

/** The key one offer is answered under, on Ask's quote card and in the page's form. */
export function kinOfferKey(offer: KinOffer): string {
  return `kin:${offer.relation}:${offer.key}`;
}
