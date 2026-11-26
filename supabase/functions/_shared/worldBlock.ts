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

/** One habitat as `campaign_habitats`, its places by name and its life by name, for the block. */
export interface HabitatForBlock {
  name: string;
  places: string[];
  life: People[];
}

/** What the block reads of `campaign_habitats`, `campaign_habitat_places` (with its place's name) and `campaign_habitat_life_named`. */
export const WORLD_BLOCK_HABITAT_COLUMNS = "id, name";
export const WORLD_BLOCK_HABITAT_PLACE_COLUMNS = "habitat_id, location:locations(name)";
export const WORLD_BLOCK_HABITAT_LIFE_COLUMNS = "habitat_id, name, percent";

/** An embedded many-to-one row: PostgREST sends an object, supabase-js types it as a list when the table has no generated types. */
type Embedded<T> = T | readonly T[] | null;

export interface HabitatRows {
  habitats: readonly { id: string; name: string }[];
  /** A place this reader may not read comes with no `location`, and is left out. */
  places: readonly { habitat_id: string; location: Embedded<{ name: string }> }[];
  /** Already without the creatures this reader may not name: their share falls under "anything else". */
  life: readonly { habitat_id: string; name: string; percent: number }[];
}

/** Joins the three reads into the habitats the block names, in the order given. One rule for both loaders. */
export function habitatsForBlock(rows: HabitatRows): HabitatForBlock[] {
  return rows.habitats.map((h) => ({
    name: h.name,
    places: rows.places.filter((p) => p.habitat_id === h.id).flatMap((p) => (Array.isArray(p.location) ? p.location : p.location ? [p.location] : []).map((l) => l.name)),
    life: rows.life.filter((l) => l.habitat_id === h.id),
  }));
}

/**
 * One line a habitat: "Salt marsh (the Marsh, Saltmere's edge): Marsh eel 40%, Giant frog 20%, anything else 40%".
 * A habitat with neither a place nor a creature tells a generator nothing and is left out; "" when none is left.
 */
export function habitatsLines(list: readonly HabitatForBlock[]): string {
  return list
    .filter((h) => h.places.length > 0 || h.life.some((l) => l.percent > 0))
    .map((h) => {
      const where = h.places.length > 0 ? ` (${h.places.join(", ")})` : "";
      const life = sharesLine(h.life, "anything else");
      return `${h.name}${where}${life ? `: ${life}` : ""}`;
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
      `## Life of the world\n${block.habitats}\nWhen a creature turns up somewhere, choose it at these odds for the country it is in.`,
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
