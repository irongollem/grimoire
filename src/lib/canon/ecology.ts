/**
 * The field guide's client-side helpers (#1283): what a roll changes with the hour and the season, how a link reads
 * as a sentence, which form stands for a species, and the words the screens use. The share arithmetic is
 * `@edge-shared/ecologyShares.ts`, shared with the world block.
 */
import type { SeasonKind } from "@/types/calendar.types";
import {
  ABUNDANCE_WEIGHT,
  DEFAULT_OTHER_PERCENT,
  LIVES_AS_FACTOR,
  speciesShare,
  workedOutShares,
} from "@edge-shared/ecologyShares.ts";
import type { Abundance, Activity, Clade, Kingdom, LinkKind, LivesAs, Species, SpeciesForm, SpeciesLink, TimeOfDay } from "./ecologyTypes";

export { ABUNDANCE_WEIGHT, DEFAULT_OTHER_PERCENT, LIVES_AS_FACTOR, speciesShare, workedOutShares };
export type { WorkedOut, WorkedShare } from "@edge-shared/ecologyShares.ts";

export const LIVES_AS_LABEL: Record<LivesAs, string> = {
  alone: "Alone",
  pairs: "In pairs",
  family: "In family groups",
  harem: "In harems",
  herd: "In herds, flocks or shoals",
  colony: "In colonies or swarms",
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  day: "By day",
  twilight: "At dawn and dusk",
  night: "By night",
  any: "At any time",
};

export const ABUNDANCE_LABEL: Record<Abundance, string> = {
  very_rare: "Very rare",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
  abundant: "Abundant",
};

export const KINGDOM_LABEL: Record<Kingdom, string> = { animal: "Animal", plant: "Plant", fungus: "Fungus", other: "Other" };

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };

/** A link read from its source species: "eats", "lives on". */
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  eats: "eats",
  competes: "competes with",
  helps: "helps",
  lives_on: "lives on",
  shelters: "shelters",
  carries: "carries",
};

/** A link read from its target's side. */
export const LINK_KIND_BACKWARD_LABEL: Record<LinkKind, string> = {
  eats: "is eaten by",
  competes: "competes with",
  helps: "helps",
  lives_on: "is home to",
  shelters: "is sheltered by",
  carries: "is carried by",
};

// ── The roll at an hour and in a season ────────────────────────────────────────────────────────────────────────────

export interface RollShare {
  formId: string;
  speciesId: string;
  percent: number;
}

export interface RollWhen {
  timeOfDay: TimeOfDay | null;
  season: SeasonKind | null;
}

export const TIME_OF_DAY_WORDS: Record<TimeOfDay, string> = { dawn: "at dawn", day: "by day", dusk: "at dusk", night: "by night" };

/** Does the activity put the species about at this hour? */
export function isAboutAt(activity: Activity, time: TimeOfDay): boolean {
  if (activity === "any") return true;
  if (activity === "day") return time === "day";
  if (activity === "night") return time === "night";
  return time === "dawn" || time === "dusk";
}

/**
 * Shares at an hour and in a season. A species away that season is off the roll; one resting at this hour is met half as
 * often. What a species gives up is not handed to the others: it falls to "anything else".
 */
export function rollAdjust<T extends RollShare>(shares: readonly T[], speciesById: ReadonlyMap<string, Species>, when: RollWhen): { shares: T[]; notes: string[] } {
  const notes: string[] = [];
  const noted = new Set<string>();
  const adjusted = shares.map((share) => {
    const species = speciesById.get(share.speciesId);
    if (species === undefined) return share;
    let factor = 1;
    let note: string | null = null;
    if (when.season !== null && species.seasons[when.season]?.away === true) {
      factor = 0;
      note = `${species.name} is away in ${when.season}.`;
    } else if (when.timeOfDay !== null && species.activity !== null && !isAboutAt(species.activity, when.timeOfDay)) {
      factor = 0.5;
      note = `${species.name} is resting ${TIME_OF_DAY_WORDS[when.timeOfDay]}, so it is met half as often.`;
    }
    if (note !== null && !noted.has(species.id)) {
      noted.add(species.id);
      notes.push(note);
    }
    return factor === 1 ? share : { ...share, percent: Math.round(share.percent * factor * 100) / 100 };
  });
  return { shares: adjusted, notes };
}

// ── A link as a sentence ───────────────────────────────────────────────────────────────────────────────────────────

export type LinkToken =
  | { type: "word"; text: string }
  | { type: "species"; id: string; name: string }
  | { type: "form"; id: string; name: string };

export interface LinkContext {
  speciesById: ReadonlyMap<string, Species>;
  formsById: ReadonlyMap<string, SpeciesForm>;
  /** A form's stat block name, or null when it has none or it cannot be read. */
  statBlockNameByForm: ReadonlyMap<string, string | null>;
}

/** A form is named by its stat block when that says more than the species; otherwise "grown Pith Piper". */
function formTokens(formId: string, ctx: LinkContext): LinkToken[] {
  const form = ctx.formsById.get(formId);
  if (form === undefined) return [];
  const species = ctx.speciesById.get(form.speciesId);
  if (species === undefined) return [];
  const statName = ctx.statBlockNameByForm.get(formId) ?? null;
  if (statName !== null && statName !== species.name) return [{ type: "form", id: form.id, name: statName }];
  return [
    { type: "word", text: form.label.toLowerCase() },
    { type: "species", id: species.id, name: species.name },
  ];
}

function sideTokens(speciesId: string | null, formId: string | null, ctx: LinkContext): LinkToken[] {
  if (speciesId === null) return [{ type: "word", text: "other animals" }];
  if (formId !== null) {
    const narrowed = formTokens(formId, ctx);
    if (narrowed.length > 0) return narrowed;
  }
  const species = ctx.speciesById.get(speciesId);
  return species === undefined ? [] : [{ type: "species", id: species.id, name: species.name }];
}

/**
 * A link as a sentence from one species' side. A form narrowed on the perspective side leads the sentence; otherwise the
 * sentence starts at the verb, since the page it is on is already about that species.
 */
export function linkWords(link: SpeciesLink, perspectiveSpeciesId: string, ctx: LinkContext): LinkToken[] {
  const forward = link.fromSpeciesId === perspectiveSpeciesId;
  const verb = (forward ? LINK_KIND_LABEL : LINK_KIND_BACKWARD_LABEL)[link.kind];
  const lead = forward
    ? link.fromFormId === null ? [] : formTokens(link.fromFormId, ctx)
    : link.toFormId === null ? [] : formTokens(link.toFormId, ctx);
  const other = forward ? sideTokens(link.toSpeciesId, link.toFormId, ctx) : sideTokens(link.fromSpeciesId, link.fromFormId, ctx);
  return [...lead, { type: "word", text: verb }, ...other];
}

/** The tokens as plain text, with a full stop. */
export function linkSentence(tokens: readonly LinkToken[]): string {
  const text = tokens.map((t) => (t.type === "word" ? t.text : t.name)).join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// ── Small readers ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The form that stands for a species: the one met most often, else the first by stage then label. */
export function thumbnailFormId(forms: readonly SpeciesForm[], percentByForm: ReadonlyMap<string, number>): string | null {
  if (forms.length === 0) return null;
  const ordered = [...forms].sort((a, b) => a.stageOrder - b.stageOrder || a.label.localeCompare(b.label));
  let best: SpeciesForm | null = null;
  let bestPercent = 0;
  for (const form of ordered) {
    const percent = percentByForm.get(form.id);
    if (percent !== undefined && percent > bestPercent) {
      best = form;
      bestPercent = percent;
    }
  }
  return (best ?? ordered[0]).id;
}

/** The clades from the root down to this one. Stops on a missing parent, and on a cycle. */
export function cladePath(cladeId: string | null, clades: readonly Clade[]): Clade[] {
  const byId = new Map(clades.map((c) => [c.id, c]));
  const path: Clade[] = [];
  const seen = new Set<string>();
  for (let at = cladeId; at !== null && !seen.has(at); ) {
    seen.add(at);
    const clade = byId.get(at);
    if (clade === undefined) break;
    path.unshift(clade);
    at = clade.parentId;
  }
  return path;
}
