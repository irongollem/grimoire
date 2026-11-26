/**
 * How often each form of a habitat is met (#1283). The DM may type a share for any form; every form left empty is
 * worked out here from how common its species is in the habitat and how that species lives. Pure and import-free, so the
 * client (the roll, the editor) and the edge world block say the same numbers.
 */

export type AbundanceKey = "very_rare" | "rare" | "uncommon" | "common" | "abundant";
export type LivesAsKey = "alone" | "pairs" | "family" | "harem" | "herd" | "colony";

export const ABUNDANCE_WEIGHT: Record<AbundanceKey, number> = { very_rare: 1, rare: 3, uncommon: 8, common: 20, abundant: 40 };

/** A group is met as one encounter, so it is met less often per head. */
export const LIVES_AS_FACTOR: Record<LivesAsKey, number> = { alone: 1, pairs: 0.8, family: 0.7, harem: 0.6, herd: 0.5, colony: 0.5 };

/** What "anything else" is when the DM has not said. */
export const DEFAULT_OTHER_PERCENT = 10;

export interface EcologySpeciesInput {
  speciesId: string;
  abundance: AbundanceKey | null;
  livesAs: LivesAsKey | null;
}

export interface EcologyLifeInput {
  formId: string;
  speciesId: string;
  /** The DM's share, or null for one worked out here. */
  percent: number | null;
}

export interface WorkedOutInput {
  species: readonly EcologySpeciesInput[];
  life: readonly EcologyLifeInput[];
  otherPercent: number | null;
}

export interface WorkedShare {
  percent: number;
  /** True when the DM typed it. */
  set: boolean;
}

export interface WorkedOut {
  forms: Map<string, WorkedShare>;
  other: WorkedShare;
}

const roundTenth = (n: number): number => Math.round(n * 10) / 10;

const weightOf = (s: EcologySpeciesInput | undefined): number => {
  // An unset abundance weighs as "uncommon"; an unset way of living changes nothing.
  const abundance = s === undefined || s.abundance === null ? ABUNDANCE_WEIGHT.uncommon : ABUNDANCE_WEIGHT[s.abundance];
  const factor = s === undefined || s.livesAs === null ? 1 : LIVES_AS_FACTOR[s.livesAs];
  return abundance * factor;
};

export function workedOutShares(input: WorkedOutInput): WorkedOut {
  const otherSet = input.otherPercent !== null;
  const other = input.otherPercent ?? DEFAULT_OTHER_PERCENT;
  const setTotal = input.life.reduce((sum, l) => sum + (l.percent ?? 0), 0);
  const free = Math.max(0, 100 - other - setTotal);

  const speciesById = new Map(input.species.map((s) => [s.speciesId, s]));
  const bySpecies = new Map<string, EcologyLifeInput[]>();
  for (const l of input.life) bySpecies.set(l.speciesId, [...(bySpecies.get(l.speciesId) ?? []), l]);

  const weights = new Map<string, number>();
  for (const id of bySpecies.keys()) weights.set(id, weightOf(speciesById.get(id)));
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0);

  const raws = new Map<string, number>();
  for (const [speciesId, forms] of bySpecies) {
    const unset = forms.filter((f) => f.percent === null);
    if (unset.length === 0) continue;
    const target = weightSum > 0 ? ((weights.get(speciesId) ?? 0) / weightSum) * (100 - other) : 0;
    const setOfSpecies = forms.reduce((sum, f) => sum + (f.percent ?? 0), 0);
    const each = Math.max(0, target - setOfSpecies) / unset.length;
    for (const f of unset) raws.set(f.formId, each);
  }

  const rawTotal = [...raws.values()].reduce((a, b) => a + b, 0);
  const forms = new Map<string, WorkedShare>();
  for (const l of input.life) {
    if (l.percent !== null) {
      forms.set(l.formId, { percent: l.percent, set: true });
      continue;
    }
    let percent = 0;
    if (free > 0) percent = rawTotal > 0 ? ((raws.get(l.formId) ?? 0) / rawTotal) * free : free / raws.size;
    forms.set(l.formId, { percent: roundTenth(percent), set: false });
  }
  return { forms, other: { percent: other, set: otherSet } };
}

/** What a species comes to: the sum of its forms' shares. */
export function speciesShare(forms: ReadonlyMap<string, WorkedShare | number>, formIds: readonly string[]): number {
  const sum = formIds.reduce((total, id) => {
    const v = forms.get(id);
    return total + (v === undefined ? 0 : typeof v === "number" ? v : v.percent);
  }, 0);
  return roundTenth(sum);
}
