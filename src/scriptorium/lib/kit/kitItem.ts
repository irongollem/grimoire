/*
 * What the book kit hands to the page (#1176 frame 13): a block from the
 * registry, a campaign entry, or a picture. The same three shapes travel on a
 * drag and on a click, and the page's drop handler reads them as untrusted
 * data: a drop can carry anything a browser puts in a drag.
 */
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";
import { findBlockEntry } from "@/scriptorium/lib/blockRegistry";

export type KitItem =
  | { kind: "block"; label: string }
  | { kind: "entity"; entityType: EntityEmbedType; entityId: string; name: string }
  | { kind: "art"; src: string };

export const KIT_MIME = "application/x-scriptorium-kit";

const ENTITY_TYPES: readonly EntityEmbedType[] = [
  "npc",
  "monster",
  "spell",
  "item",
  "location",
  "quest",
  "deity",
  "species",
  "faction",
  "subclass",
];

function isEntityType(value: unknown): value is EntityEmbedType {
  return typeof value === "string" && ENTITY_TYPES.some((t) => t === value);
}

/** Reads a dropped payload; anything that is not a kit item is null. */
export function parseKitItem(raw: string): KitItem | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v: Record<string, unknown> = { ...value };
  if (v.kind === "block" && typeof v.label === "string" && v.label !== "") {
    return { kind: "block", label: v.label };
  }
  if (
    v.kind === "entity" &&
    isEntityType(v.entityType) &&
    typeof v.entityId === "string" &&
    v.entityId !== "" &&
    typeof v.name === "string"
  ) {
    return { kind: "entity", entityType: v.entityType, entityId: v.entityId, name: v.name };
  }
  if (v.kind === "art" && typeof v.src === "string" && v.src !== "") {
    return { kind: "art", src: v.src };
  }
  return null;
}

/** The kit item being dragged right now: a drag over the page cannot read its data, only its types. */
let dragging: KitItem | null = null;
export function startKitDrag(event: DragEvent, item: KitItem): void {
  dragging = item;
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(KIT_MIME, JSON.stringify(item));
  event.dataTransfer.effectAllowed = "copy";
}
export function endKitDrag(): void {
  dragging = null;
}
export function currentKitDrag(): KitItem | null {
  return dragging;
}

const ENTITY_LABELS: Record<EntityEmbedType, string> = {
  npc: "NPC",
  monster: "Monster",
  spell: "Spell",
  item: "Item",
  location: "Place",
  quest: "Quest",
  deity: "Deity",
  species: "Species",
  faction: "Faction",
  subclass: "Subclass",
};
export function entityTypeLabel(type: EntityEmbedType): string {
  return ENTITY_LABELS[type];
}

/** The drop line's caption: "Drop: NPC Rosie Sugarfoot". */
export function dropCaption(item: KitItem): string {
  if (item.kind === "block") {
    const entry = findBlockEntry(item.label);
    return `Drop: ${entry?.kit ?? item.label}`;
  }
  if (item.kind === "entity") return `Drop: ${ENTITY_LABELS[item.entityType]} ${item.name}`;
  return "Drop: Picture";
}
