// The live table (#1125 decision 12): pings, measure lines and drawings on the battle map travel as Realtime
// Broadcast on a private topic of their own, sent by any campaign member and stored nowhere. The payload comes
// from another client, so nothing in it is trusted until `parseTableMessage` has accepted it.

export const TABLE_BROADCAST_EVENT = "table";

/** Points per measure line or stroke. A hand-drawn stroke at 60 Hz is a few hundred points at most. */
export const MAX_POINTS = 500;
const MAX_ID = 64;
const MAX_NAME = 80;
const MAX_WIDTH = 64;
// Colours are painted into SVG/CSS by the receiver, so only plain colour literals pass.
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(?:rgb|hsl)a?\([0-9 ,.%/-]{1,40}\))$/;

export type Point = readonly [number, number];

export interface TableSender {
  id: string;
  name: string;
  color: string;
}

export type TableMessage =
  | { event: "ping"; x: number; y: number; by: TableSender; at: number }
  | { event: "measure"; id: string; points: Point[]; by: TableSender; at: number }
  | { event: "measure-clear"; id: string }
  | {
      event: "draw";
      id: string;
      points: Point[];
      color: string;
      width: number;
      by: TableSender;
      pinned: boolean;
      at: number;
    }
  | { event: "draw-clear"; id: string }
  | { event: "draw-clear"; all: true };

export function tableTopic(campaignId: string): string {
  return `table:${campaignId}`;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

function parseColor(v: unknown): string | null {
  return typeof v === "string" && COLOR.test(v) ? v : null;
}

function parseSender(v: unknown): TableSender | null {
  if (!isObj(v)) return null;
  const id = str(v.id, MAX_ID);
  const name = str(v.name, MAX_NAME);
  const color = parseColor(v.color);
  return id && name && color ? { id, name, color } : null;
}

function parsePoints(v: unknown): Point[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_POINTS) return null;
  const out: Point[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = num(p[0]);
    const y = num(p[1]);
    if (x === null || y === null) return null;
    out.push([x, y]);
  }
  return out;
}

/** The message if it is well formed, else null. Unknown fields are dropped. */
export function parseTableMessage(raw: unknown): TableMessage | null {
  if (!isObj(raw)) return null;
  switch (raw.event) {
    case "ping": {
      const x = num(raw.x);
      const y = num(raw.y);
      const by = parseSender(raw.by);
      const at = num(raw.at);
      return x !== null && y !== null && by && at !== null ? { event: "ping", x, y, by, at } : null;
    }
    case "measure": {
      const id = str(raw.id, MAX_ID);
      const points = parsePoints(raw.points);
      const by = parseSender(raw.by);
      const at = num(raw.at);
      return id && points && by && at !== null ? { event: "measure", id, points, by, at } : null;
    }
    case "measure-clear": {
      const id = str(raw.id, MAX_ID);
      return id ? { event: "measure-clear", id } : null;
    }
    case "draw": {
      const id = str(raw.id, MAX_ID);
      const points = parsePoints(raw.points);
      const color = parseColor(raw.color);
      const width = num(raw.width);
      const by = parseSender(raw.by);
      const at = num(raw.at);
      if (!id || !points || !color || width === null || !by || at === null) return null;
      if (width <= 0 || width > MAX_WIDTH || typeof raw.pinned !== "boolean") return null;
      return { event: "draw", id, points, color, width, by, pinned: raw.pinned, at };
    }
    case "draw-clear": {
      if (raw.all === true) return { event: "draw-clear", all: true };
      const id = str(raw.id, MAX_ID);
      return id ? { event: "draw-clear", id } : null;
    }
    default:
      return null;
  }
}
