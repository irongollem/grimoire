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
import { tiptapToPlainText } from "../../../src/lib/tiptap/tiptapText.ts";

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

function entryText(row: CanonRowForBlock): string {
  const title = row.title.trim();
  if (title) return title;
  return tiptapToPlainText(row.body).trim();
}

export function worldBlockFromRows(setting: string | null, rows: CanonRowForBlock[]): WorldBlock {
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
  if (block.lines.length) {
    sections.push(`## Lines\nNever include, in any form:\n${bullets(block.lines)}`);
  }
  if (block.veils.length) {
    sections.push(`## Veils\nMay happen, but only off the page:\n${bullets(block.veils)}`);
  }
  if (!sections.length) return "";
  return `\n\n${GROUNDING}\n\n${sections.join("\n\n")}`;
}

/** The setting string for a picture: the world's name, its look, and what is never shown. "" when empty. */
export function worldImageSetting(block: WorldBlock): string {
  const parts: string[] = [];
  if (block.world) parts.push(block.world);
  if (block.look) parts.push(`Look: ${block.look.replace(/\s*\n+\s*/g, " ")}`);
  if (block.lines.length) parts.push(`Never depict: ${block.lines.join("; ")}`);
  return parts.join(". ");
}
