/*
 * A book drawn from the campaign (#1226 story 8, frame 10): the chapters of a
 * setting book, each made of linked entries (`entityEmbed`), never copies, so the
 * book follows the campaign until it is published and a book drawn out and read
 * back in finds the same rows.
 *
 * Pure. A reader gathers a `BookSource` (the DM's own reads, or the Open Book's
 * whole-party snapshot for a players' copy, see `campaignBookSource.ts`) and
 * `buildCampaignBook` sets it into chapters. What a players' copy leaves out is
 * decided here and nowhere else: the DM's own chapters (arcs, forces, secrets, backstories, how the world works), and the monsters,
 * treasures and spells, which the one rule for what a player may read (the Open
 * Book snapshot) does not cover.
 *
 * Every chapter opens with its own level-1 heading, which is where a book is cut
 * into chapters (`splitIntoChapters`).
 */
import type { JSONContent } from "@tiptap/core";
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";
import { buildAtlasIndex, childrenOf } from "@/lib/locations/tree";
import { sortLore } from "@/lib/canon/canonLore";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";
import type { LocationSummary, LocationType } from "@/types/location.types";
import { doc, em, h1, h2, h3, p } from "@/scriptorium/data/templates/builders";
import {
  ABUNDANCE_LABEL,
  ACTIVITY_LABEL,
  KINGDOM_LABEL,
  LIVES_AS_LABEL,
  cladePath,
  linkSentence,
  linkWords,
  speciesShare,
  workedOutShares,
} from "@/lib/canon/ecology";
import type { Clade, HabitatLifeRow, HabitatSpecies, Species, SpeciesForm, SpeciesLink } from "@/lib/canon/ecologyTypes";
import { SEASON_KINDS } from "@/types/calendar.types";

/** Who the book is for: the DM's book holds everything, a players' book only what the whole party may read. */
export type BookAudience = "dm" | "players";

export interface SourceEntry {
  id: string;
  title: string;
}

export interface SourceLore extends SourceEntry {
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
}

export interface SourcePlace {
  id: string;
  parent_id: string | null;
  name: string;
  location_type: LocationType;
  sort_order: number | null;
}

export interface SourceFolk {
  id: string;
  name: string;
  location_id: string | null;
}

export interface SourceDeity {
  id: string;
  name: string;
  pantheon_id: string | null;
}

/** An arc of the story: written out in the book, because an arc is not an entry a page can link to. */
export interface SourceArc {
  id: string;
  name: string;
  summary: string | null;
  question: string | null;
  stakes: string | null;
  ending: string | null;
}

/** A people or a habitat: a name and what is written of it, as plain text (neither can be linked to either). */
export interface SourceDescribed {
  id: string;
  name: string;
  /** The people's share of the population, 0 to 100; absent for a habitat. */
  percent?: number;
  text: string;
}

/** A habitat: its name, what is written of it as plain text, and the DM's "anything else" share (null for the default). */
export interface SourceHabitat extends SourceDescribed {
  otherPercent: number | null;
}

/** A species of the field guide, its description already flattened to plain text. */
export type SourceSpecies = Omit<Species, "description"> & { text: string };

/** A form on a habitat's roll; the names are not needed, only which form, of which species, at what share. */
export type SourceLife = Pick<HabitatLifeRow, "habitatId" | "speciesId" | "formId" | "percent">;

/** The facts the world runs on that a reader needs: its calendar and its coins. Null when nothing was chosen. */
export interface SourceWorldRules {
  calendar: { name: string; epoch: string; months: string[] } | null;
  coins: string[];
}

/** Everything a book can draw on, already limited to what the reader behind it may read. */
export interface BookSource {
  premise: SourceEntry[];
  /** Truths known to all. */
  truths: SourceEntry[];
  lore: SourceLore[];
  forces: SourceEntry[];
  secrets: SourceEntry[];
  questions: SourceEntry[];
  /** The campaign's arcs, the DM's own: a players' source leaves them empty. */
  arcs: SourceArc[];
  peoples: SourceDescribed[];
  habitats: SourceHabitat[];
  /** The field guide (#1283): the DM's own, so a players' source leaves every one of these empty. */
  clades: Clade[];
  species: SourceSpecies[];
  forms: SpeciesForm[];
  links: SpeciesLink[];
  habitatSpecies: HabitatSpecies[];
  habitatLife: SourceLife[];
  /** A form's stat block name; a form with none, or one this reader cannot read, is null or absent. */
  statBlockNameByForm: ReadonlyMap<string, string | null>;
  /** One backstory entry per character who has one. */
  backstories: SourceEntry[];
  world: SourceWorldRules;
  places: SourcePlace[];
  folk: SourceFolk[];
  factions: { id: string; name: string }[];
  pantheons: { id: string; name: string }[];
  deities: SourceDeity[];
  quests: SourceEntry[];
  monsters: { id: string; name: string }[];
  items: { id: string; name: string }[];
  spells: { id: string; name: string }[];
}

export interface DrawnBook {
  chapters: { content: JSONContent }[];
}

/** What a canon entry is called in the kit and in a list: its title, or what kind of entry it is when it has none. */
export function canonEntryName(entry: Pick<CanonEntry, "part" | "title" | "premise_kind">): string {
  return entry.title.trim() || canonPartLabel(entry);
}

const PREMISE_LABEL: Record<PremiseKind, string> = {
  pitch: "Pitch",
  theme: "Theme",
  table: "At the table",
  voice: "Voice",
  look: "Look",
  line: "Line",
  veil: "Veil",
};

export function premiseLabel(kind: PremiseKind | null): string {
  return kind ? PREMISE_LABEL[kind] : "Premise";
}

const PART_LABEL: Record<CanonEntry["part"], string> = {
  premise: "Premise",
  truth: "Truth",
  force: "Force",
  secret: "Secret",
  question: "Question",
  lore: "Lore",
  backstory: "Backstory",
};

export function canonPartLabel(entry: Pick<CanonEntry, "part" | "premise_kind">): string {
  return entry.part === "premise" ? premiseLabel(entry.premise_kind) : PART_LABEL[entry.part];
}

/** One linked entry. A monster starts its own page (the embed's own default); every other entry runs on. */
export function embed(entityType: EntityEmbedType, entityId: string): JSONContent {
  return { type: "entityEmbed", attrs: { entityType, entityId, startsPage: entityType === "monster" } };
}

/** A DM box around blocks the players' copy must never print (`layoutContent` takes it out of every print). */
function dmBox(...blocks: JSONContent[]): JSONContent {
  return { type: "secretBlock", content: blocks };
}

/** A chapter, or nothing when it has no entries to hold: an empty chapter is left out. */
function chapter(title: string, ...sections: (JSONContent[] | null)[]): { content: JSONContent } | null {
  const body = sections.flatMap((s) => s ?? []);
  if (body.length === 0) return null;
  return { content: doc(h1(title), ...body) };
}

/** A heading and its entries, or nothing when there are none. */
function section(title: string | null, level: 2 | 3, entries: JSONContent[]): JSONContent[] | null {
  if (entries.length === 0) return null;
  const heading = title === null ? [] : [level === 2 ? h2(title) : h3(title)];
  return [...heading, ...entries];
}

/** The Atlas in its tree's order: scale, then the DM's order, then name, each place before what lies within it. */
export function atlasOrder(places: readonly SourcePlace[]): SourcePlace[] {
  // The index reads three fields of a summary; a place here carries exactly those and its parent.
  const index = buildAtlasIndex(places as unknown as LocationSummary[]);
  const out: SourcePlace[] = [];
  const visit = (id: string) => {
    const place = index.byId.get(id) as unknown as SourcePlace;
    out.push(place);
    for (const child of childrenOf(index, id)) visit(child.id);
  };
  for (const id of index.rootIds) visit(id);
  return out;
}

function foldChapter(source: BookSource, audience: BookAudience) {
  const dm = audience === "dm";
  return chapter(
    "The World",
    dm ? section(null, 2, source.premise.map((e) => embed("canon", e.id))) : null,
    section(dm ? "What everyone knows" : null, 2, source.truths.map((e) => embed("canon", e.id))),
  );
}

/** Each line of some plain text (a rich text's blocks, flattened) as a paragraph. */
function paragraphs(text: string | null): JSONContent[] {
  return (text ?? "")
    .split(/\n+/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => p(block));
}

/** A people or a habitat: its name always, and what is written of it below. A name with nothing written is still in the book. */
function described(title: string, text: string | null): JSONContent[] {
  return [h2(title), ...paragraphs(text)];
}

/** One arc: its name, then the question, stakes and ending that are written. */
function arcSection(arc: SourceArc): JSONContent[] {
  const lines: [string, string | null][] = [["", arc.summary], ["What it asks: ", arc.question], ["What is at stake: ", arc.stakes], ["How it ended: ", arc.ending]];
  return [h2(arc.name), ...lines.filter(([, text]) => (text ?? "").trim() !== "").map(([label, text]) => p(`${label}${text!.trim()}`))];
}

const pct = (n: number): string => `${Math.round(n * 10) / 10}%`;

/** A habitat: its description, then "What lives here": each species with how common it is and its share of the life met. */
function habitatSection(habitat: SourceHabitat, source: BookSource): JSONContent[] {
  const species = new Map(source.species.map((s) => [s.id, s]));
  const here = source.habitatSpecies.filter((hs) => hs.habitatId === habitat.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const life = source.habitatLife.filter((l) => l.habitatId === habitat.id);
  const worked = workedOutShares({
    species: here.map((hs) => ({ speciesId: hs.speciesId, abundance: hs.abundance, livesAs: species.get(hs.speciesId)?.livesAs ?? null })),
    life,
    otherPercent: habitat.otherPercent,
  });
  const lines = here.flatMap((hs) => {
    const s = species.get(hs.speciesId);
    if (s === undefined) return [];
    const formIds = life.filter((l) => l.speciesId === s.id).map((l) => l.formId);
    // A plant (or any species with no form on the roll) has no share to work out: it is listed as living here.
    const parts = [hs.abundance === null ? null : ABUNDANCE_LABEL[hs.abundance], formIds.length === 0 ? null : `about ${pct(speciesShare(worked.forms, formIds))} of what is met`].filter((x): x is string => x !== null);
    return [p(parts.length === 0 ? s.name : `${s.name}: ${parts.join(", ")}`)];
  });
  return [...described(habitat.name, habitat.text), ...(lines.length === 0 ? [] : [h3("What lives here"), ...lines])];
}

/** The chain of ranks a species is filed under, root first, as the key it is grouped and ordered by. */
function fieldGuideGroups(source: BookSource): { title: string; species: SourceSpecies[] }[] {
  const groups = new Map<string, { title: string; order: (number | string)[]; species: SourceSpecies[] }>();
  for (const s of source.species) {
    const path = cladePath(s.cladeId, source.clades);
    const key = path.map((c) => c.id).join("/");
    const group = groups.get(key) ?? {
      title: path.length === 0 ? "In no clade" : path.map((c) => c.name).join(", "),
      order: path.length === 0 ? [Number.MAX_SAFE_INTEGER] : path.flatMap((c) => [c.sortOrder, c.name]),
      species: [],
    };
    group.species.push(s);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.order.length, b.order.length); i++) {
        if (a.order[i] === b.order[i]) continue;
        return typeof a.order[i] === "number" ? (a.order[i] as number) - (b.order[i] as number) : String(a.order[i]).localeCompare(String(b.order[i]));
      }
      return a.order.length - b.order.length;
    })
    .map((g) => ({ title: g.title, species: g.species.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }));
}

/** One species: names, how it lives, when it is about, its forms, its links from its own side, and what is written of it. */
function speciesEntry(s: SourceSpecies, source: BookSource): JSONContent[] {
  const speciesById = new Map<string, Species>(source.species.map((x) => [x.id, { ...x, description: null }]));
  const formsById = new Map(source.forms.map((f) => [f.id, f]));
  const ctx = { speciesById, formsById, statBlockNameByForm: source.statBlockNameByForm };
  const seasons = SEASON_KINDS.flatMap((kind) => {
    const season = s.seasons[kind];
    if (season === undefined) return [];
    const word = kind.charAt(0).toUpperCase() + kind.slice(1);
    const note = (season.note ?? "").trim();
    return [season.away ? `${word}: away${note === "" ? "" : `, ${note}`}` : note === "" ? null : `${word}: ${note}`].filter((x): x is string => x !== null);
  });
  const how = [KINGDOM_LABEL[s.kingdom], s.livesAs === null ? null : LIVES_AS_LABEL[s.livesAs], s.activity === null ? null : ACTIVITY_LABEL[s.activity], ...seasons].filter((x): x is string => x !== null);
  const forms = source.forms
    .filter((f) => f.speciesId === s.id)
    .sort((a, b) => a.stageOrder - b.stageOrder || a.label.localeCompare(b.label))
    .map((f) => (f.domesticated ? `${f.label} (domesticated)` : f.label));
  const links = source.links.filter((l) => l.fromSpeciesId === s.id || l.toSpeciesId === s.id).map((l) => linkSentence(linkWords(l, s.id, ctx)));
  const scientific = (s.scientificName ?? "").trim();
  return [
    h3(s.name),
    ...(scientific === "" ? [] : [p(em(scientific))]),
    p(how.join(". ") + "."),
    ...(forms.length === 0 ? [] : [p(`Forms: ${forms.join(", ")}.`)]),
    ...links.map((l) => p(l)),
    ...paragraphs(s.text),
  ];
}

function fieldGuideChapter(source: BookSource): { content: JSONContent } | null {
  return chapter("Field guide", ...fieldGuideGroups(source).map((g) => [h2(g.title), ...g.species.flatMap((s) => speciesEntry(s, source))]));
}

function worldRulesSection(world: SourceWorldRules): JSONContent[] | null {
  const body: JSONContent[] = [];
  if (world.calendar) {
    const epoch = world.calendar.epoch.trim();
    body.push(p(`The calendar is ${world.calendar.name}${epoch === "" ? "" : `, years counted in ${epoch}`}.`));
    if (world.calendar.months.length > 0) body.push(p(`Its months: ${world.calendar.months.join(", ")}.`));
  }
  if (world.coins.length > 0) body.push(p(`The world pays in ${world.coins.join(", ")}.`));
  return body.length === 0 ? null : body;
}

export function buildCampaignBook(source: BookSource, audience: BookAudience): DrawnBook {
  const dm = audience === "dm";

  const lore = sortLore(source.lore);
  const places = atlasOrder(source.places);
  const placeIds = new Set(places.map((p) => p.id));

  // Folk under where they live, in the Atlas's order; people of no place, or of one the book lacks, last.
  const folkByPlace = new Map<string, SourceFolk[]>();
  const wanderers: SourceFolk[] = [];
  for (const person of [...source.folk].sort((a, b) => a.name.localeCompare(b.name))) {
    if (person.location_id !== null && placeIds.has(person.location_id)) {
      const list = folkByPlace.get(person.location_id) ?? [];
      list.push(person);
      folkByPlace.set(person.location_id, list);
    } else {
      wanderers.push(person);
    }
  }
  const folkSections = [
    ...places.flatMap((p) => {
      const people = folkByPlace.get(p.id);
      return people ? [section(p.name, 2, people.map((n) => embed("npc", n.id)))] : [];
    }),
    section(folkByPlace.size > 0 ? "Elsewhere" : null, 2, wanderers.map((n) => embed("npc", n.id))),
  ];

  const pantheonIds = new Set(source.pantheons.map((p) => p.id));
  const looseDeities = source.deities.filter((d) => d.pantheon_id === null || !pantheonIds.has(d.pantheon_id));
  const powers = [
    section("Factions", 2, source.factions.map((f) => embed("faction", f.id))),
    section(source.pantheons.length > 0 ? "The pantheon" : "The gods", 2, looseDeities.map((d) => embed("deity", d.id))),
    ...source.pantheons.map((pantheon) =>
      section(
        pantheon.name,
        3,
        source.deities.filter((d) => d.pantheon_id === pantheon.id).map((d) => embed("deity", d.id)),
      ),
    ),
  ];

  const chapters = [
    foldChapter(source, audience),
    dm ? chapter("How the World Works", worldRulesSection(source.world)) : null,
    chapter("History and Legend", section(null, 2, lore.map((e) => embed("canon", e.id)))),
    chapter("Peoples", ...source.peoples.map((x) => described(x.percent === undefined ? x.name : `${x.name} (${x.percent}%)`, x.text))),
    chapter("Habitats", ...source.habitats.map((x) => habitatSection(x, source))),
    fieldGuideChapter(source),
    // An arc is the DM's story: the players' copy has no chapter for it.
    dm ? chapter("Arcs", ...source.arcs.map((arc) => arcSection(arc))) : null,
    // A secret and a force are the DM's: the players' copy has no chapter for them at all.
    dm ? chapter("What is Moving", section(null, 2, source.forces.map((e) => embed("canon", e.id)))) : null,
    dm
      ? chapter(
          "Secrets",
          // The DM's book sets each secret in a DM box, so even the DM's own print leaves it out of a copy for players.
          section(null, 2, source.secrets.map((e) => dmBox(embed("canon", e.id)))),
          section("Open questions", 2, source.questions.map((e) => embed("canon", e.id))),
        )
      : null,
    dm ? chapter("Backstories", section(null, 2, source.backstories.map((e) => embed("canon", e.id)))) : null,
    chapter("Gazetteer", section(null, 2, places.map((p) => embed("location", p.id)))),
    chapter("Folk", ...folkSections),
    chapter("Factions and Powers", ...powers),
    dm ? chapter("Adventures", section(null, 2, source.quests.map((q) => embed("quest", q.id)))) : null,
    dm ? chapter("Bestiary", section(null, 2, source.monsters.map((m) => embed("monster", m.id)))) : null,
    dm
      ? chapter(
          "Treasures and Spells",
          section("Treasures", 2, source.items.map((i) => embed("item", i.id))),
          section("Spells", 2, source.spells.map((s) => embed("spell", s.id))),
        )
      : null,
  ];

  return { chapters: chapters.filter((c): c is { content: JSONContent } => c !== null) };
}

/** The book's title: the campaign's name and whose book it is. */
export function campaignBookTitle(campaignName: string, audience: BookAudience): string {
  return audience === "dm" ? `${campaignName}: the DM's book` : `${campaignName}: the players' book`;
}

