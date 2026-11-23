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

export interface WorldBlock {
  world: string | null;
  pitch: string | null;
  themes: string[];
  table: string[];
  voice: string | null;
  look: string | null;
  lines: string[];
  veils: string[];
  truths: string[];
  /** "Elf 80%, Human 15%, anyone else 5%", largest first; null when the DM has not said who lives there. */
  peoples: string | null;
}

/** One people of the world and its share of the population, as `campaigns.peoples` stores it. */
export interface People {
  name: string;
  percent: number;
}

/**
 * Reads `campaigns.peoples` defensively: anything but an array of `{ name, percent }` with a non-blank name and a
 * finite percent above zero is dropped, so an unexpected shape yields an empty list and never a throw.
 */
export function parsePeoples(raw: unknown): People[] {
  if (!Array.isArray(raw)) return [];
  const out: People[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { name, percent } = item as { name?: unknown; percent?: unknown };
    if (typeof name !== "string" || name.trim() === "") continue;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0) continue;
    out.push({ name: name.trim(), percent });
  }
  return out;
}

const roundShare = (n: number): number => Math.round(n * 100) / 100;

/**
 * The peoples as words for a prompt, largest share first, the unlisted remainder last as "anyone else":
 * "Elf 80%, Human 15%, anyone else 5%". "" for an empty list. Shares of zero are left out.
 */
export function peoplesLine(list: readonly People[]): string {
  const listed = list.filter((p) => p.percent > 0);
  if (listed.length === 0) return "";
  const parts = [...listed]
    .sort((a, b) => b.percent - a.percent)
    .map((p) => `${p.name} ${roundShare(p.percent)}%`);
  const rest = roundShare(100 - listed.reduce((sum, p) => sum + p.percent, 0));
  if (rest > 0) parts.push(`anyone else ${rest}%`);
  return parts.join(", ");
}

export interface CanonRowForBlock {
  part: string;
  premise_kind: string | null;
  knowledge: string | null;
  title: string;
  body: string | null;
  sort_order: number;
}

/** Columns the block reads, for both the server and the client loader. */
export const WORLD_BLOCK_CANON_COLUMNS = "part, premise_kind, knowledge, title, body, sort_order";
/** PostgREST `or` filter: the premise, and only the truths known to all. */
export const WORLD_BLOCK_CANON_FILTER = "part.eq.premise,and(part.eq.truth,knowledge.eq.all)";

const GROUNDING =
  "Campaign context provided by the DM (use it to ground tone, names, factions, and themes, but do not invent new facts that contradict it):";

/** Premise kinds whose text is the body, under a heading the DM or the book import gave it. */
const TEXT_KINDS: ReadonlySet<string> = new Set(["pitch", "voice", "look", "table", "theme"]);

/**
 * What a premise entry says: for a kind that carries text, its body's plain text, headed by its title when both
 * exist and differ; a title alone stands. A line, a veil or a truth is its title, a body standing in when empty.
 * One rule for every generator and for the canon suggester's "already have" list.
 */
export function premiseEntryText(kind: string | null, titleRaw: string, bodyRaw: string | null): string {
  const title = titleRaw.trim();
  const body = plainWithoutSecrets(bodyRaw).trim();
  if (kind !== null && TEXT_KINDS.has(kind)) {
    if (body === "") return title;
    return title === "" || title === body ? body : `${title}: ${body}`;
  }
  return title !== "" ? title : body;
}

const entryText = (row: CanonRowForBlock): string => premiseEntryText(row.part === "premise" ? row.premise_kind : null, row.title, row.body);

export function worldBlockFromRows(setting: string | null, rows: CanonRowForBlock[], peoples: unknown): WorldBlock {
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
    lines: ofKind("line"),
    veils: ofKind("veil"),
    truths: ordered
      .filter((r) => r.part === "truth" && r.knowledge === "all")
      .map(entryText)
      .filter((t) => t.length > 0),
    peoples: peoplesLine(parsePeoples(peoples)) || null,
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
