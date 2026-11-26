/**
 * The ecology half of the world block (#1283): what lives in a habitat, how often it is met, what it eats, what it is
 * kin to. Pure, like worldBlock.ts, so the browser can import it. The share rule is `ecologyShares.ts`, not re-derived here.
 */
import { workedOutShares, speciesShare, type AbundanceKey, type LivesAsKey } from "./ecologyShares.ts";

export type LinkKind = "eats" | "competes" | "helps" | "lives_on" | "shelters" | "carries";

/** A species that lives in the habitat, with its clade already named. */
export interface EcologySpecies {
  id: string;
  name: string;
  kingdom: string;
  livesAs: LivesAsKey | null;
  abundance: AbundanceKey | null;
  clade: { id: string; name: string } | null;
}

/** One form on the habitat's roll; `percent` is the DM's share, null for one worked out. */
export interface EcologyLife {
  formId: string;
  speciesId: string;
  percent: number | null;
}

/** A link already scoped to this habitat; a narrowed side carries its form's label. */
export interface EcologyLink {
  kind: LinkKind;
  fromSpeciesId: string;
  fromForm: string | null;
  toSpeciesId: string | null;
  toForm: string | null;
}

export interface HabitatEcology {
  otherPercent: number | null;
  species: EcologySpecies[];
  life: EcologyLife[];
  links: EcologyLink[];
}

export const MAX_FOOD_WEB_LINKS = 12;

const VERB: Record<LinkKind, string> = {
  eats: "eats",
  competes: "competes with",
  helps: "helps",
  lives_on: "lives on",
  shelters: "shelters",
  carries: "carries",
};

const shown = (n: number): string => String(Math.round(n * 10) / 10);

export interface EcologyLines {
  /** "Puffrush 15% (common), Pith Piper 23.4% (abundant), anything else 10%"; "" when nothing is met. */
  shares: string;
  /** Indented lines under the habitat's own: also here, food web, kin. Empty ones are left out. */
  extra: string[];
}

export function ecologyLines(eco: HabitatEcology): EcologyLines {
  const worked = workedOutShares({
    species: eco.species.map((s) => ({ speciesId: s.id, abundance: s.abundance, livesAs: s.livesAs })),
    life: eco.life,
    otherPercent: eco.otherPercent,
  });
  const nameOf = new Map(eco.species.map((s) => [s.id, s.name]));
  const shareOf = new Map<string, number>();
  const rolled = new Set(eco.life.map((l) => l.speciesId));
  for (const id of rolled) {
    shareOf.set(
      id,
      speciesShare(
        worked.forms,
        eco.life.filter((l) => l.speciesId === id).map((l) => l.formId),
      ),
    );
  }

  const met = eco.species
    .filter((s) => (shareOf.get(s.id) ?? 0) > 0)
    .sort((a, b) => (shareOf.get(b.id) ?? 0) - (shareOf.get(a.id) ?? 0));
  const parts = met.map((s) => `${s.name} ${shown(shareOf.get(s.id) ?? 0)}%${s.abundance ? ` (${s.abundance.replace("_", " ")})` : ""}`);
  if (met.length > 0 && worked.other.percent > 0) parts.push(`anything else ${shown(worked.other.percent)}%`);

  const extra: string[] = [];
  const never = eco.species.filter((s) => !rolled.has(s.id));
  if (never.length > 0) extra.push(`Also here, never met as an encounter: ${never.map((s) => `${s.name} (${s.kingdom})`).join(", ")}.`);

  const here = new Set(eco.species.map((s) => s.id));
  const side = (form: string | null, name: string): string => (form ? `${form.toLowerCase()} ${name}` : name);
  const web = eco.links
    .filter((l) => here.has(l.fromSpeciesId) && (l.toSpeciesId === null || here.has(l.toSpeciesId)))
    .map((l, i) => ({ l, i, weight: (shareOf.get(l.fromSpeciesId) ?? 0) + (l.toSpeciesId === null ? 0 : (shareOf.get(l.toSpeciesId) ?? 0)) }))
    .sort((a, b) => b.weight - a.weight || a.i - b.i)
    .slice(0, MAX_FOOD_WEB_LINKS)
    .map(({ l }) => {
      const from = side(l.fromForm, nameOf.get(l.fromSpeciesId) ?? "");
      const to = l.toSpeciesId === null ? "other animals" : side(l.toForm, nameOf.get(l.toSpeciesId) ?? "");
      return `${from} ${VERB[l.kind]} ${to}`;
    });
  if (web.length > 0) extra.push(`Food web: ${web.join("; ")}.`);

  const byClade = new Map<string, { name: string; members: string[] }>();
  for (const s of eco.species) {
    if (s.clade === null) continue;
    const entry = byClade.get(s.clade.id);
    if (entry) entry.members.push(s.name);
    else byClade.set(s.clade.id, { name: s.clade.name, members: [s.name] });
  }
  const kin = [...byClade.values()]
    .filter((g) => g.members.length > 1)
    .map((g) => `${g.members.slice(0, -1).join(", ")} and ${g.members[g.members.length - 1]} (${g.name})`);
  if (kin.length > 0) extra.push(`Kin: ${kin.join("; ")}.`);

  return { shares: parts.join(", "), extra };
}
