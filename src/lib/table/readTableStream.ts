import { asShown } from "@edge-shared/agent/show.ts";
import { parseFightChange } from "./fight/fightChange";
import { parseDmRoll } from "./dmRoll";
import { parseRollAsk, parseRolled } from "./tableRoll";
import type { TableEvent, TableFight, TableLine, TablePressure } from "./soloTypes";

/** A quest clock has at most this many segments; a longer one is not a clock this page knows how to draw. */
const MAX_PIPS = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A line as the stream and a stored `tool_result` both carry it, or null when it is not one. */
export function parseTableLine(raw: unknown): TableLine | null {
  if (!isRecord(raw) || (raw.kind !== "spoken" && raw.kind !== "acted") || typeof raw.text !== "string") return null;
  const speaker = raw.speaker;
  if (!isRecord(speaker) || typeof speaker.name !== "string") return null;
  const id = typeof speaker.id === "string" ? speaker.id : null;
  return {
    kind: raw.kind,
    speaker: { id, name: speaker.name },
    text: raw.text,
    ...(typeof raw.to === "string" ? { to: raw.to } : {}),
    ...(typeof raw.how === "string" ? { how: raw.how } : {}),
  };
}

/**
 * A clock as the stream and the stored sitting both carry it, or null when it is not one. Whole numbers only, and
 * never fuller than it is long: the pips are drawn from these two numbers and nothing else.
 */
export function parseTablePressure(raw: unknown): TablePressure | null {
  if (!isRecord(raw)) return null;
  const { filled, segments } = raw;
  if (typeof filled !== "number" || typeof segments !== "number") return null;
  if (!Number.isInteger(filled) || !Number.isInteger(segments)) return null;
  if (segments < 1 || segments > MAX_PIPS || filled < 0 || filled > segments) return null;
  return { filled, segments };
}

/** A fight as the stream and the stored sitting carry it, or null when it is not one. */
export function parseTableFight(raw: unknown): TableFight | null {
  if (!isRecord(raw) || typeof raw.encounterId !== "string" || raw.encounterId === "" || typeof raw.name !== "string") return null;
  return { encounterId: raw.encounterId, name: raw.name };
}

/**
 * One decoded `data:` payload to a typed event, or null for anything this screen does not know.
 * The stream is the server's, but a malformed or newer event must not take the page down: it is skipped.
 */
export function parseTableEvent(raw: unknown): TableEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "session": {
      if (typeof raw.sessionId !== "string") return null;
      const c = raw.character;
      return {
        type: "session",
        sessionId: raw.sessionId,
        ...(isRecord(c) && typeof c.id === "string" && typeof c.name === "string" ? { character: { id: c.id, name: c.name } } : {}),
      };
    }
    case "text":
      return typeof raw.delta === "string" ? { type: "text", delta: raw.delta } : null;
    case "tool_start":
      return typeof raw.name === "string" ? { type: "tool_start", name: raw.name } : null;
    case "tool_end":
      return typeof raw.name === "string" ? { type: "tool_end", name: raw.name, isError: raw.isError === true } : null;
    case "line": {
      const line = parseTableLine(raw.line);
      return line ? { type: "line", line, ...(typeof raw.voice === "string" && raw.voice !== "" ? { voice: raw.voice } : {}) } : null;
    }
    case "scene": {
      const s = raw.scene;
      return isRecord(s) && typeof s.id === "string" && typeof s.name === "string" ? { type: "scene", scene: { id: s.id, name: s.name } } : null;
    }
    case "fact": {
      const f = raw.fact;
      return isRecord(f) && typeof f.id === "string" && typeof f.body === "string" ? { type: "fact", fact: { id: f.id, body: f.body } } : null;
    }
    case "pressure": {
      // An explicit null is the pressure coming off; anything else malformed is skipped, so a bad payload never
      // takes a running clock off the page.
      if (raw.pressure === null) return { type: "pressure", pressure: null };
      const pressure = parseTablePressure(raw.pressure);
      return pressure ? { type: "pressure", pressure } : null;
    }
    case "ask_roll": {
      const roll = parseRollAsk(raw.roll);
      return roll ? { type: "ask_roll", roll } : null;
    }
    case "fight_change": {
      const change = parseFightChange(raw.change);
      return change ? { type: "fight_change", change } : null;
    }
    case "voice": {
      if ((raw.role !== "narrator" && raw.role !== "player") || typeof raw.text !== "string" || raw.text.trim() === "") return null;
      if (typeof raw.voice !== "string" || raw.voice === "") return null;
      return { type: "voice", role: raw.role, text: raw.text, key: raw.voice };
    }
    case "hands":
      return typeof raw.text === "string" && raw.text.trim() !== "" ? { type: "hands", text: raw.text.trim() } : null;
    case "hit_points": {
      const c = raw.change;
      if (!isRecord(c) || (c.change !== "heal" && c.change !== "harm") || typeof c.why !== "string") return null;
      const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
      if (!whole(c.by) || !whole(c.hp) || !whole(c.maxHp)) return null;
      return { type: "hit_points", change: { heals: c.change === "heal", why: c.why, by: c.by, hp: c.hp, maxHp: c.maxHp } };
    }
    case "introduced": {
      const person = raw.person;
      return isRecord(person) && typeof person.name === "string" && person.name.trim() !== "" ? { type: "introduced", name: person.name } : null;
    }
    case "fight": {
      // An explicit null is the fight's aftermath having been told; a malformed one is skipped, so a bad payload
      // never takes the way to a running fight off the page.
      if (raw.fight === null) return { type: "fight", fight: null, ...(raw.calledOff === true ? { calledOff: true as const } : {}) };
      const fight = parseTableFight(raw.fight);
      return fight ? { type: "fight", fight } : null;
    }
    case "dm_roll": {
      const roll = parseDmRoll(raw.roll);
      return roll ? { type: "dm_roll", roll } : null;
    }
    case "rolled": {
      const roll = parseRolled(raw.roll);
      return roll ? { type: "rolled", roll } : null;
    }
    case "done":
      return {
        type: "done",
        end: typeof raw.end === "string" ? raw.end : "",
        credits: typeof raw.credits === "number" && Number.isFinite(raw.credits) ? raw.credits : 0,
        tokens: typeof raw.tokens === "number" && Number.isFinite(raw.tokens) ? raw.tokens : 0,
        ...(raw.floor === "characters" ? { floor: "characters" as const } : {}),
      };
    case "shown": {
      // Untrusted like the rest of the stream: a picture's address goes into an image.
      const shown = asShown(raw.shown);
      return shown ? { type: "shown", shown } : null;
    }
    case "error":
      return { type: "error", message: typeof raw.message === "string" ? raw.message : "The turn failed.", ...(raw.withheld === true ? { withheld: true as const } : {}) };
    default:
      return null;
  }
}

function eventFromBlock(block: string): TableEvent | null {
  // A block is `data: <json>` lines; a comment line (": keep-alive") has none and is skipped.
  const payload = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (payload === "") return null;
  try {
    return parseTableEvent(JSON.parse(payload));
  } catch {
    return null;
  }
}

/**
 * The server-sent events of an `agent-turn` response, as typed events, in order.
 * Chunks arrive wherever the network cut them: an event may be split across two, and several may share one,
 * so text is buffered until a blank line ends an event.
 */
export async function* readTableStream(response: Response): AsyncGenerator<TableEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut >= 0) {
        const event = eventFromBlock(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
        if (event) yield event;
        cut = buffer.indexOf("\n\n");
      }
    }
    // A stream that ends mid-event never finished it: the half block is dropped, not guessed at.
  } finally {
    reader.releaseLock();
  }
}
