/**
 * What a wiki-export page becomes in a content table (#932): the columns of
 * the row, written DM-only and with no AI provenance (nothing here was
 * generated; AI Act marking, #611). Pure: the sweep inserts what this returns.
 *
 * Bodies arrive as Tiptap documents, are stored as JSON strings and are never
 * capped (the AI importer's 600-character cap exists to paraphrase a book; this
 * is the DM's own writing). A link in a body is written as its plain label on
 * the first pass and turned into a mention on the second, once every record it
 * can point at exists, so an `archiveLink` placeholder never reaches the
 * database.
 */
import { resolveEnum, LOCATION_TYPES } from "@/lib/documentImport/normalize";
import { LOCATION_TYPE_TIER, isSiteType } from "@/lib/locations/tiers";
import { ITEM_RARITIES, ITEM_TYPES } from "@/types/item.types";
import type { LocationType } from "@/types/location.types";
import type { NoteCategory } from "@/types/notes.types";
import type { NpcStatus } from "@/types/npc.types";
import { fieldsForKind, type ArchiveFields } from "./fields";
import { frontmatterString } from "./frontmatter";
import { collectLinkTargets, resolveArchiveLinks } from "./links";
import type { ArchiveMentionTarget, ArchivePage, ArchivePageKind, TiptapDoc } from "./types";

export type ArchiveRecordKind = Exclude<ArchivePageKind, "skip">;
export type ArchiveTable = "npcs" | "locations" | "factions" | "items" | "quests" | "notes" | "quest_beats";

export const TABLE_FOR_KIND: Record<ArchiveRecordKind, Exclude<ArchiveTable, "quest_beats">> = {
  npc: "npcs",
  location: "locations",
  faction: "factions",
  item: "items",
  quest: "quests",
  note: "notes",
};

const NPC_STATUSES: readonly NpcStatus[] = ["alive", "dead", "missing", "unknown"];
const NOTE_CATEGORIES: readonly NoteCategory[] = ["general", "session", "lore", "location", "quest", "faction"];

/** A body column: which table row it lives on, and its column. */
export interface DocColumn {
  table: ArchiveTable;
  column: string;
  doc: TiptapDoc;
}

/** Every rich-text column the page fills, per the kind the DM settled. A quest's beat prose is a column of its opening beat. */
export function docColumnsOf(fields: ArchiveFields): DocColumn[] {
  switch (fields.kind) {
    case "npc":
      return (["appearance", "personality", "backstory", "notes"] as const).flatMap((column) =>
        fields[column] ? [{ table: "npcs" as const, column, doc: fields[column] }] : [],
      );
    case "location":
      return fields.description ? [{ table: "locations", column: "description", doc: fields.description }] : [];
    case "faction":
      return fields.description ? [{ table: "factions", column: "description", doc: fields.description }] : [];
    case "item":
      return fields.description ? [{ table: "items", column: "description", doc: fields.description }] : [];
    case "quest":
      return fields.beatContent ? [{ table: "quest_beats", column: "dm_content", doc: fields.beatContent }] : [];
    case "note":
      return fields.content ? [{ table: "notes", column: "content", doc: fields.content }] : [];
  }
}

/** True when the doc still holds a link placeholder, so a second pass has something to resolve. */
export function hasLinks(doc: TiptapDoc): boolean {
  return collectLinkTargets(doc.content).length > 0;
}

/** The doc as stored text, links resolved through `resolve` (the first pass passes one that knows nothing). */
export function storedDoc(doc: TiptapDoc, resolve: (target: string, label: string) => ArchiveMentionTarget | null): string {
  return JSON.stringify(resolveArchiveLinks(doc, resolve));
}

const noMention = (): null => null;

export interface RowContext {
  campaignId: string;
  /** Already-created parent place (locations) or the place an NPC stands in. */
  parentLocationId: string | null;
  /** The kind of the parent place, when known; decides whether an interior type may keep its parent. */
  parentLocationType: LocationType | null;
}

export interface BuiltRow {
  row: Record<string, unknown>;
  /** What was adjusted on the way, for the result screen. */
  notes: string[];
}

function setIf(row: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null && value !== undefined) row[key] = value;
}

function docText(doc: TiptapDoc | undefined): string | undefined {
  return doc ? storedDoc(doc, noMention) : undefined;
}

export function locationTypeOf(page: ArchivePage): LocationType {
  return resolveEnum<LocationType>(frontmatterString(page.frontmatter.location_type) ?? undefined, LOCATION_TYPES, "other");
}

/**
 * The columns of the row a page becomes. Quests return the quest row only; the
 * opening beat that carries the prose is built by `openingBeatRow`.
 */
export function buildRecordRow(page: ArchivePage, kind: ArchiveRecordKind, ctx: RowContext): BuiltRow {
  const fields = fieldsForKind(page, kind);
  const notes: string[] = [];
  const row: Record<string, unknown> = { campaign_id: ctx.campaignId };

  switch (fields.kind) {
    case "npc": {
      row.name = page.title;
      setIf(row, "race", frontmatterString(page.frontmatter.race));
      setIf(row, "occupation", frontmatterString(page.frontmatter.occupation));
      setIf(row, "alignment", frontmatterString(page.frontmatter.alignment));
      const status = frontmatterString(page.frontmatter.status)?.toLowerCase();
      if (status && (NPC_STATUSES as readonly string[]).includes(status)) row.status = status;
      for (const column of ["appearance", "personality", "backstory", "notes"] as const) setIf(row, column, docText(fields[column]));
      setIf(row, "location_id", ctx.parentLocationId);
      row.tags = page.tags;
      break;
    }
    case "location": {
      row.name = page.title;
      let type = locationTypeOf(page);
      let parentId = ctx.parentLocationId;
      // `guard_location_room_parent` (a BEFORE INSERT trigger) refuses an interior place whose parent is not a
      // site, and it fires on this very insert, so the downgrade has to happen here, not afterwards.
      if (LOCATION_TYPE_TIER[type] === "interior" && !(parentId && ctx.parentLocationType && isSiteType(ctx.parentLocationType))) {
        notes.push(`"${page.title}" has no building or dungeon to sit in, so it was imported as Other.`);
        type = "other";
        parentId = null;
      }
      row.location_type = type;
      setIf(row, "parent_id", parentId);
      setIf(row, "description", docText(fields.description));
      row.tags = page.tags;
      break;
    }
    case "faction": {
      row.name = page.title;
      setIf(row, "faction_type", frontmatterString(page.frontmatter.faction_type));
      setIf(row, "alignment", frontmatterString(page.frontmatter.alignment));
      setIf(row, "description", docText(fields.description));
      row.tags = page.tags;
      break;
    }
    case "item": {
      row.name = page.title;
      row.item_type = resolveEnum(frontmatterString(page.frontmatter.item_type) ?? undefined, ITEM_TYPES, "gear");
      row.rarity = resolveEnum(frontmatterString(page.frontmatter.rarity) ?? undefined, ITEM_RARITIES, "mundane");
      setIf(row, "description", docText(fields.description));
      row.tags = page.tags;
      break;
    }
    case "quest": {
      row.title = page.title;
      setIf(row, "summary", fields.summary);
      // The same value a hand-made quest starts with: an imported page is not a live quest on the board.
      row.status = "undiscovered";
      row.tags = page.tags;
      break;
    }
    case "note": {
      row.title = fields.title;
      setIf(row, "content", docText(fields.content));
      row.category = fields.category && (NOTE_CATEGORIES as readonly string[]).includes(fields.category) ? fields.category : "lore";
      row.tags = fields.tags;
      break;
    }
  }
  return { row, notes };
}

/** The opening beat that holds a quest page's prose (the quest's `summary` is one plain line, so the rest has to live somewhere). */
export function openingBeatRow(questId: string, campaignId: string, title: string, doc: TiptapDoc): Record<string, unknown> {
  return {
    quest_id: questId,
    campaign_id: campaignId,
    title,
    dm_content: storedDoc(doc, noMention),
    // Written hidden, like every beat: showing it to players is the DM's call per beat.
    visibility: "hidden",
    kind: "neutral",
  };
}
