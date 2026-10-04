/**
 * Filling an unwritten room with AI (#910). A room is a zoomed-in beat, so the
 * fill writes what a beat has: a boxed read-aloud passage, then what is here
 * for the DM. This module is the pure half: the grounding lines sent to the
 * model, the validation of what comes back, and the Tiptap document.
 */
import { extractTiptapText } from "@/lib/utils";
import type { DoorKind } from "@/types/locationDoor.types";
import type { Location } from "@/types/location.types";

/** The edge function takes at most 12 constraint lines of 400 characters. */
const MAX_LINES = 12;
const MAX_LINE = 400;
const SITE_BLURB = 300;
const ROOM_BLURB = 200;
const MAX_FEATURES = 8;
const MAX_FEATURE = 300;

export interface RoomNeighbour {
  name: string;
  kind: DoorKind;
  label: string;
  locked: boolean;
  lockNote: string | null;
  secret: boolean;
}

export interface RoomFillContext {
  site: Pick<Location, "name" | "location_type" | "description"> | null;
  /** The room's level, when it sits on one rather than directly in the site. */
  level: { name: string; ordinal: number; total: number } | null;
  room: Pick<Location, "id" | "name" | "description">;
  neighbours: readonly RoomNeighbour[];
  /** The other rooms on the same floor, in list order. */
  siblings: readonly Pick<Location, "id" | "name">[];
}

/** A door as `useSiteDoors` returns it, reduced to what neighbours need. */
export interface DoorEdge {
  from_location_id: string;
  to_location_id: string | null;
  is_one_way: boolean;
  door_kind: DoorKind;
  label: string;
  starts_locked: boolean;
  lock_note: string | null;
  is_secret: boolean;
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
}

/** Every way out of `roomId`: doors it starts, and two-way doors that end on it. */
export function neighboursOf(roomId: string, doors: readonly DoorEdge[]): RoomNeighbour[] {
  const result: RoomNeighbour[] = [];
  for (const d of doors) {
    let other: { name: string } | null = null;
    if (d.from_location_id === roomId) other = d.to_location;
    else if (d.to_location_id === roomId && !d.is_one_way) other = d.from_location;
    else continue;
    result.push({
      name: other?.name ?? "untraced space",
      kind: d.door_kind,
      label: d.label,
      locked: d.starts_locked,
      lockNote: d.lock_note,
      secret: d.is_secret,
    });
  }
  return result;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function withBlurb(head: string, description: string | null, max: number): string {
  const blurb = extractTiptapText(description, max).trim();
  return blurb ? `${head} — ${blurb}` : head;
}

function describeExit(n: RoomNeighbour): string {
  const parts = [`${n.name} via ${n.label ? `${n.kind} "${n.label}"` : n.kind}`];
  if (n.locked) parts.push(n.lockNote ? `locked: ${n.lockNote}` : "locked");
  if (n.secret) parts.push("secret, DM-only");
  return parts.join(", ");
}

/** The grounding lines for the model. At most 12, each at most 400 characters. */
export function buildRoomFillConstraints(ctx: RoomFillContext): string[] {
  const lines: string[] = [];
  if (ctx.site) lines.push(withBlurb(`Site: ${ctx.site.name} (${ctx.site.location_type})`, ctx.site.description, SITE_BLURB));
  if (ctx.level) lines.push(`Level: ${ctx.level.name} (floor ${ctx.level.ordinal} of ${ctx.level.total})`);
  lines.push(withBlurb(`Room: ${ctx.room.name}`, ctx.room.description, ROOM_BLURB));
  lines.push(
    ctx.neighbours.length
      ? `Exits: ${ctx.neighbours.map(describeExit).join("; ")}`
      : "Exits: none recorded yet, do not invent any",
  );
  const others = ctx.siblings.filter((s) => s.id !== ctx.room.id).map((s) => s.name);
  if (others.length) lines.push(`Other rooms on this level: ${others.join(", ")}`);
  return lines.slice(0, MAX_LINES).map((l) => clip(l, MAX_LINE));
}

export interface RoomFill {
  readAloud: string;
  description: string;
  features: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Model output is untrusted: keep strings, drop the rest, refuse an empty room. */
export function normalizeRoomFill(raw: unknown): RoomFill {
  if (typeof raw !== "object" || raw === null) throw new Error("The model did not return a room. Try again.");
  const r = raw as Record<string, unknown>;
  const readAloud = text(r.read_aloud);
  const description = text(r.description);
  const features = (Array.isArray(r.features) ? r.features : [])
    .map(text)
    .filter(Boolean)
    .slice(0, MAX_FEATURES)
    .map((f) => clip(f, MAX_FEATURE));
  if (!readAloud && !description) throw new Error("The model returned an empty room. Try again.");
  return { readAloud, description, features };
}

interface Node { type: string; content?: Node[]; text?: string }

function paragraphs(value: string): Node[] {
  return value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
}

/** Read-aloud in a blockquote, the DM's paragraphs, then the features as bullets. */
export function roomFillToTiptap(fill: RoomFill): string {
  const content: Node[] = [];
  if (fill.readAloud) content.push({ type: "blockquote", content: paragraphs(fill.readAloud) });
  content.push(...paragraphs(fill.description));
  if (fill.features.length) {
    content.push({
      type: "bulletList",
      content: fill.features.map((f) => ({ type: "listItem", content: paragraphs(f) })),
    });
  }
  return JSON.stringify({ type: "doc", content });
}
