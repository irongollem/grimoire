/**
 * The world block (#1226): the one short block every AI generator reads, built
 * from the campaign's canon. Always in it: the world's name, the pitch, the
 * themes and table feel, the voice, the look, the lines and veils, and the
 * truths known to all. Lines and veils bind every generator. A secret, a truth
 * only some know and a force never enter it: this file is the only place that
 * decides what a generator may be told, so the audience rule lives here and
 * nowhere else.
 *
 * Pure (no Deno-only imports) so the browser imports it as
 * `@edge-shared/worldBlock.ts`.
 */
import { plainWithoutSecrets } from "./secretBlocks.ts";
import type { MentionNameOf } from "./mentionNames.ts";
import type { AbundanceKey, LivesAsKey } from "./ecologyShares.ts";
import { ecologyLines, type EcologySpecies, type HabitatEcology, type LinkKind } from "./worldBlockEcology.ts";

export interface WorldBlock {
  world: string | null;
  pitch: string | null;
  themes: string[];
  table: string[];
  voice: string | null;
  look: string | null;
  /** The look's style reference pictures (#1252): public storage URLs, at most four, from the Look entry. */
  lookReferences: string[];
  lines: string[];
  veils: string[];
  truths: string[];
  /** "Elf 80%, Human 15%, anyone else 5%", largest first; null when the DM has not said who lives there. */
  peoples: string | null;
  /** One line per habitat ("Salt marsh (the Marsh): Marsh eel 40%, anything else 60%"); null when the DM has described none. */
  habitats: string | null;
  /** What the world wrongly believes (#1279 item 15): the cover stories of open secrets, and only those lines. Never the secret's title or body. */
  commonBeliefs: string[];
}

/** One people of the world and its share of the population, as `campaign_peoples_named` reads it. */
export interface People {
  name: string;
  percent: number;
}

const roundShare = (n: number): number => Math.round(n * 100) / 100;

/**
 * Shares as words for a prompt, largest first, the unlisted remainder last under `rest`:
 * "Elf 80%, Human 15%, anyone else 5%". "" for an empty list. Shares of zero are left out.
 */
export function sharesLine(list: readonly People[], rest: string): string {
  const listed = list.filter((p) => p.percent > 0);
  if (listed.length === 0) return "";
  const parts = [...listed]
    .sort((a, b) => b.percent - a.percent)
    .map((p) => `${p.name} ${roundShare(p.percent)}%`);
  const left = roundShare(100 - listed.reduce((sum, p) => sum + p.percent, 0));
  if (left > 0) parts.push(`${rest} ${left}%`);
  return parts.join(", ");
}

export const peoplesLine = (list: readonly People[]): string => sharesLine(list, "anyone else");

/** A people as `campaign_peoples_named` reads it: its own name (a culture) over the record's, and what they are like. */
export interface PeopleRow extends People {
  own_name?: string | null;
  record_name?: string | null;
  /** The editor's document, as stored. */
  body?: string | null;
}

/** How long a people's description may run in the block: the block is read by every generator on every call. */
const PEOPLE_SUMMARY_MAX = 200;

/**
 * The first sentence of a text, or its first ~200 characters when it has no early sentence end, on one line. "" for
 * nothing. Used for what a people is like in the world block and in the NPC prompt.
 */
export function shortText(text: string, max: number = PEOPLE_SUMMARY_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end >= 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

/** A people's body as one short plain line, DM-only passages left out. */
export const peopleSummary = (body: string | null | undefined, nameOf?: MentionNameOf): string => shortText(plainWithoutSecrets(body, nameOf));

/**
 * The peoples for the block. With nothing but names and shares it is `peoplesLine`'s one line. When a people has its
 * own name or words, each gets a line: "the Vell (human), 30%: Salt traders who never…", the unlisted remainder last.
 */
export function peoplesBlockText(list: readonly PeopleRow[], nameOf?: MentionNameOf): string {
  const listed = list.filter((p) => p.percent > 0);
  const summaries = listed.map((p) => peopleSummary(p.body, nameOf));
  const detailed = listed.some((p, i) => (p.own_name ?? "") !== "" || summaries[i] !== "");
  if (!detailed) return peoplesLine(list);
  const lines = listed
    .map((p, i) => ({ p, summary: summaries[i] }))
    .sort((a, b) => b.p.percent - a.p.percent)
    .map(({ p, summary }) => {
      const record = p.own_name && p.record_name && p.record_name !== p.name ? ` (${p.record_name})` : "";
      return `${p.name}${record}, ${roundShare(p.percent)}%${summary ? `: ${summary}` : ""}`;
    });
  const left = roundShare(100 - listed.reduce((sum, p) => sum + p.percent, 0));
  if (left > 0) lines.push(`anyone else, ${left}%`);
  return lines.join("\n");
}

/** One habitat as `campaign_habitats`, its places by name and its ecology, for the block. */
export interface HabitatForBlock {
  name: string;
  places: string[];
  ecology: HabitatEcology;
}

/** What the block reads of the habitat tables, for both loaders. */
export const WORLD_BLOCK_HABITAT_COLUMNS = "id, name, other_percent";
export const WORLD_BLOCK_HABITAT_PLACE_COLUMNS = "habitat_id, location:locations(name)";
/** `campaign_habitat_life_named`: a form with no readable stat block still counts, so none is filtered out for its name. */
export const WORLD_BLOCK_HABITAT_LIFE_COLUMNS = "habitat_id, species_id, form_id, percent, sort_order";
export const WORLD_BLOCK_HABITAT_SPECIES_COLUMNS = "habitat_id, species_id, abundance, sort_order";
export const WORLD_BLOCK_SPECIES_COLUMNS = "id, name, kingdom, lives_as, clade_id";
export const WORLD_BLOCK_FORM_COLUMNS = "id, species_id, label";
export const WORLD_BLOCK_LINK_COLUMNS = "from_species_id, kind, to_species_id, from_form_id, to_form_id, habitat_id";
export const WORLD_BLOCK_CLADE_COLUMNS = "id, name";

/** An embedded many-to-one row: PostgREST sends an object, supabase-js types it as a list when the table has no generated types. */
type Embedded<T> = T | readonly T[] | null;

export interface HabitatRows {
  habitats: readonly { id: string; name: string; other_percent: number | null }[];
  /** A place this reader may not read comes with no `location`, and is left out. */
  places: readonly { habitat_id: string; location: Embedded<{ name: string }> }[];
  life: readonly { habitat_id: string; species_id: string; form_id: string; percent: number | null }[];
  habitatSpecies: readonly { habitat_id: string; species_id: string; abundance: AbundanceKey | null }[];
  species: readonly { id: string; name: string; kingdom: string; lives_as: LivesAsKey | null; clade_id: string | null }[];
  forms: readonly { id: string; species_id: string; label: string }[];
  links: readonly {
    from_species_id: string;
    kind: LinkKind;
    to_species_id: string | null;
    from_form_id: string | null;
    to_form_id: string | null;
    habitat_id: string | null;
  }[];
  clades: readonly { id: string; name: string }[];
}

/** Joins the reads into the habitats the block names, in the order given. One rule for both loaders. */
export function habitatsForBlock(rows: HabitatRows): HabitatForBlock[] {
  const speciesById = new Map(rows.species.map((s) => [s.id, s]));
  const cladeById = new Map(rows.clades.map((c) => [c.id, c]));
  const formLabel = new Map(rows.forms.map((f) => [f.id, f.label]));
  return rows.habitats.map((h) => {
    const life = rows.life.filter((l) => l.habitat_id === h.id);
    // Species that live here: the DM's list, then any a form on the roll names that the list lacks.
    const ids = [...new Set([...rows.habitatSpecies.filter((s) => s.habitat_id === h.id).map((s) => s.species_id), ...life.map((l) => l.species_id)])];
    const abundanceOf = new Map(rows.habitatSpecies.filter((s) => s.habitat_id === h.id).map((s) => [s.species_id, s.abundance]));
    const species = ids.flatMap((id): EcologySpecies[] => {
      const s = speciesById.get(id);
      if (!s) return [];
      const clade = s.clade_id === null ? undefined : cladeById.get(s.clade_id);
      return [{ id, name: s.name, kingdom: s.kingdom, livesAs: s.lives_as, abundance: abundanceOf.get(id) ?? null, clade: clade ? { id: clade.id, name: clade.name } : null }];
    });
    const formOf = (id: string | null): string | null => (id === null ? null : (formLabel.get(id) ?? null));
    return {
      name: h.name,
      places: rows.places.filter((p) => p.habitat_id === h.id).flatMap((p) => (Array.isArray(p.location) ? p.location : p.location ? [p.location] : []).map((l) => l.name)),
      ecology: {
        otherPercent: h.other_percent,
        species,
        life: life.map((l) => ({ formId: l.form_id, speciesId: l.species_id, percent: l.percent })),
        links: rows.links
          .filter((l) => l.habitat_id === null || l.habitat_id === h.id)
          .map((l) => ({ kind: l.kind, fromSpeciesId: l.from_species_id, fromForm: formOf(l.from_form_id), toSpeciesId: l.to_species_id, toForm: formOf(l.to_form_id) })),
      },
    };
  });
}

/**
 * One block a habitat: "Salt marsh (the Marsh): Marsh eel 40%, anything else 60%", then indented lines for what lives
 * there but is never met, the food web and the kin. A habitat with neither a place nor a species tells a generator
 * nothing and is left out; "" when none is left.
 */
export function habitatsLines(list: readonly HabitatForBlock[]): string {
  return list
    .filter((h) => h.places.length > 0 || h.ecology.species.length > 0)
    .map((h) => {
      const where = h.places.length > 0 ? ` (${h.places.join(", ")})` : "";
      const { shares, extra } = ecologyLines(h.ecology);
      return [`${h.name}${where}${shares ? `: ${shares}` : ""}`, ...extra.map((e) => `  ${e}`)].join("\n");
    })
    .join("\n");
}

export interface CanonRowForBlock {
  part: string;
  premise_kind: string | null;
  knowledge: string | null;
  title: string;
  body: string | null;
  sort_order: number;
  reference_images: string[];
}

/** What the block reads of `campaign_peoples_named`, in the DM's order, for both loaders. */
export const WORLD_BLOCK_PEOPLES_COLUMNS = "name, percent, own_name, record_name, body";

/** What the block reads of the open secrets that carry a cover story. Filtered in the query with `WORLD_BLOCK_BELIEF_*`. */
export const WORLD_BLOCK_BELIEF_COLUMNS = "cover_story, sort_order";

/** A secret that is still a secret: not closed and not yet told. Its cover story is what the world believes meanwhile. */
export interface BeliefRow {
  cover_story: string | null;
  sort_order: number;
}

/** Columns the block reads, for both the server and the client loader. */
export const WORLD_BLOCK_CANON_COLUMNS = "part, premise_kind, knowledge, title, body, sort_order, reference_images";
/** PostgREST `or` filter: the premise, and only the truths known to all. */
export const WORLD_BLOCK_CANON_FILTER = "part.eq.premise,and(part.eq.truth,knowledge.eq.all)";

const GROUNDING =
  "Campaign context provided by the DM (use it to ground tone, names, factions, and themes, but do not invent new facts that contradict it):";

/** Premise kinds whose text is the body, under a heading the DM or the book import gave it. */
const TEXT_KINDS: ReadonlySet<string> = new Set(["pitch", "voice", "look", "table", "theme"]);

/**
 * What a premise entry says: for a kind that carries text, its body's plain text, headed by its title when both
 * exist and differ; a title alone stands. A line, a veil or a truth is its title, a body standing in when empty.
 * One rule for every generator and for the canon suggester's "already have" list. A body's @mentions store no name,
 * so `nameOf` says what each is called (`mentionNames.ts`); without it they read as nothing.
 */
export function premiseEntryText(kind: string | null, titleRaw: string, bodyRaw: string | null, nameOf?: MentionNameOf): string {
  const title = titleRaw.trim();
  const body = plainWithoutSecrets(bodyRaw, nameOf).trim();
  if (kind !== null && TEXT_KINDS.has(kind)) {
    if (body === "") return title;
    return title === "" || title === body ? body : `${title}: ${body}`;
  }
  return title !== "" ? title : body;
}

export function worldBlockFromRows(
  setting: string | null,
  rows: CanonRowForBlock[],
  peoples: readonly PeopleRow[],
  habitats: readonly HabitatForBlock[],
  nameOf?: MentionNameOf,
  beliefs: readonly BeliefRow[] = [],
): WorldBlock {
  const entryText = (row: CanonRowForBlock): string =>
    premiseEntryText(row.part === "premise" ? row.premise_kind : null, row.title, row.body, nameOf);
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const ofKind = (kind: string): string[] =>
    ordered
      .filter((r) => r.part === "premise" && r.premise_kind === kind)
      .map(entryText)
      .filter((t) => t.length > 0);
  const joined = (kind: string): string | null => {
    const parts = ofKind(kind);
    return parts.length ? parts.join("\n\n") : null;
  };
  const world = setting?.trim();
  return {
    world: world ? world : null,
    pitch: joined("pitch"),
    themes: ofKind("theme"),
    table: ofKind("table"),
    voice: joined("voice"),
    look: joined("look"),
    lookReferences: ordered
      .filter((r) => r.part === "premise" && r.premise_kind === "look")
      .flatMap((r) => r.reference_images),
    lines: ofKind("line"),
    veils: ofKind("veil"),
    truths: ordered
      .filter((r) => r.part === "truth" && r.knowledge === "all")
      .map(entryText)
      .filter((t) => t.length > 0),
    peoples: peoplesBlockText(peoples, nameOf) || null,
    habitats: habitatsLines(habitats) || null,
    commonBeliefs: [...beliefs]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((b) => (b.cover_story ?? "").trim())
      .filter((t) => t.length > 0),
  };
}

const bullets = (items: string[]): string => items.map((i) => `- ${i}`).join("\n");

/** The block for a text generator, "" when the campaign has nothing to say. */
export function worldBlockText(block: WorldBlock): string {
  const sections: string[] = [];
  if (block.world) sections.push(`## World\n${block.world}`);
  if (block.pitch) sections.push(`## Pitch\n${block.pitch}`);
  if (block.themes.length) sections.push(`## Themes\n${bullets(block.themes)}`);
  if (block.table.length) sections.push(`## At the table\n${bullets(block.table)}`);
  if (block.voice) sections.push(`## Voice\n${block.voice}`);
  if (block.truths.length) sections.push(`## Truths of the world\n${bullets(block.truths)}`);
  if (block.peoples) {
    sections.push(
      `## Peoples of the world\n${block.peoples}\nWhen you invent a person, choose who they are at these odds; do not default to humans.`,
    );
  }
  if (block.habitats) {
    sections.push(
      `## Life of the world\n${block.habitats}\nWhen a creature turns up somewhere, choose it at these odds for the country it is in, and keep to what eats what.`,
    );
  }
  if (block.commonBeliefs.length) {
    sections.push(
      `## Commonly believed\n${bullets(block.commonBeliefs)}\nPeople in the world take these for true. Let them say so, and do not contradict them unless the scene is about the truth.`,
    );
  }
  if (block.lines.length) {
    sections.push(`## Lines\nNever include, in any form:\n${bullets(block.lines)}`);
  }
  if (block.veils.length) {
    sections.push(`## Veils\nMay happen, but only off the page:\n${bullets(block.veils)}`);
  }
  if (!sections.length) return "";
  return `\n\n${GROUNDING}\n\n${sections.join("\n\n")}`;
}

/** The pitch stands in for a missing look in a picture, short: it is style context, not the story. */
const PITCH_AS_LOOK_MAX = 400;

/**
 * The setting string for a picture: the world's name, its look (the pitch's start when there is no look, since an
 * old setting prompt that carried the visual style migrated into the pitch), and what is never shown. Never the
 * voice. "" when empty.
 */
export function worldImageSetting(block: WorldBlock): string {
  const parts: string[] = [];
  if (block.world) parts.push(block.world);
  const flat = (t: string): string => t.replace(/\s*\n+\s*/g, " ");
  if (block.look) parts.push(`Look: ${flat(block.look)}`);
  else if (block.pitch) {
    const pitch = flat(block.pitch);
    parts.push(`Setting: ${pitch.length <= PITCH_AS_LOOK_MAX ? pitch : `${pitch.slice(0, PITCH_AS_LOOK_MAX - 1).trimEnd()}…`}`);
  }
  if (block.lines.length) parts.push(`Never depict: ${block.lines.join("; ")}`);
  return parts.join(". ");
}
