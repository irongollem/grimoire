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
import { doc, h1, h2, h3, p } from "@/scriptorium/data/templates/builders";

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
  habitats: SourceDescribed[];
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
    chapter("Habitats", ...source.habitats.map((x) => described(x.name, x.text))),
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

