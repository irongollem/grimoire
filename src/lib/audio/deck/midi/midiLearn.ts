/**
 * MIDI Learn (#1136), pure: a controller that is not a Launchpad gets no
 * lights, but any note or knob on it can be bound to a deck target. Bindings
 * live per browser (the controller is plugged into this machine), read
 * defensively because storage can hold anything or throw.
 */

import { DECK_LANES, DECK_TOOLS, type DeckTool } from "../deckSurface";

export type LearnTarget =
  | { type: "pad"; lane: number; row: number }
  | { type: "tool"; tool: DeckTool }
  | { type: "pageStep"; delta: -1 | 1 }
  | { type: "hush" }
  | { type: "fadeAll" }
  | { type: "pauseAll" }
  | { type: "stopAll" }
  | { type: "master" }
  | { type: "padVolume"; lane: number; row: number };

export type MidiMessageKind = "note" | "cc";

export interface MidiBinding {
  deviceName: string;
  kind: MidiMessageKind;
  /** 0 to 15. */
  channel: number;
  number: number;
  target: LearnTarget;
}

/** A note or CC message. `value` is velocity or CC value; a note off is 0. */
export interface IncomingMessage {
  kind: MidiMessageKind;
  channel: number;
  number: number;
  value: number;
}

export const BINDINGS_STORAGE_KEY = "grimoire.deckMidi.bindings.v1";

export function parseIncoming(data: ArrayLike<number>): IncomingMessage | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0x90) return { kind: "note", channel, number: data[1], value: data[2] };
  if (status === 0x80) return { kind: "note", channel, number: data[1], value: 0 };
  if (status === 0xb0) return { kind: "cc", channel, number: data[1], value: data[2] };
  return null;
}

/** Targets that need a continuous value, so only a CC can be bound to them. */
export function needsContinuous(target: LearnTarget): boolean {
  return target.type === "master" || target.type === "padVolume";
}

export function targetKey(target: LearnTarget): string {
  switch (target.type) {
    case "pad":
    case "padVolume":
      return `${target.type}:${target.lane},${target.row}`;
    case "tool":
      return `tool:${target.tool}`;
    case "pageStep":
      return `pageStep:${target.delta}`;
    default:
      return target.type;
  }
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parseTarget(raw: unknown): LearnTarget | null {
  if (typeof raw !== "object" || raw === null) return null;
  const t = raw as Record<string, unknown>;
  switch (t.type) {
    case "pad":
    case "padVolume":
      return isInt(t.lane, 0, DECK_LANES - 1) && isInt(t.row, 0, 255) ? { type: t.type, lane: t.lane, row: t.row } : null;
    case "tool":
      return typeof t.tool === "string" && (DECK_TOOLS as readonly string[]).includes(t.tool)
        ? { type: "tool", tool: t.tool as DeckTool }
        : null;
    case "pageStep":
      return t.delta === 1 || t.delta === -1 ? { type: "pageStep", delta: t.delta } : null;
    case "hush":
    case "fadeAll":
    case "pauseAll":
    case "stopAll":
    case "master":
      return { type: t.type };
    default:
      return null;
  }
}

function parseBinding(raw: unknown): MidiBinding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.deviceName !== "string" || b.deviceName === "") return null;
  if (b.kind !== "note" && b.kind !== "cc") return null;
  if (!isInt(b.channel, 0, 15) || !isInt(b.number, 0, 127)) return null;
  const target = parseTarget(b.target);
  if (!target) return null;
  if (needsContinuous(target) && b.kind !== "cc") return null;
  return { deviceName: b.deviceName, kind: b.kind, channel: b.channel, number: b.number, target };
}

/** Anything unreadable gives an empty list, a bad entry is dropped alone. Never throws. */
export function parseBindings(raw: string | null): MidiBinding[] {
  if (raw === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof json !== "object" || json === null) return [];
  const list = (json as Record<string, unknown>).bindings;
  if (!Array.isArray(list)) return [];
  return list.map(parseBinding).filter((b): b is MidiBinding => b !== null);
}

export function serializeBindings(bindings: readonly MidiBinding[]): string {
  return JSON.stringify({ version: 1, bindings });
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadBindings(storage: StorageLike | null): MidiBinding[] {
  if (!storage) return [];
  try {
    return parseBindings(storage.getItem(BINDINGS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveBindings(storage: StorageLike | null, bindings: readonly MidiBinding[]): void {
  if (!storage) return;
  try {
    storage.setItem(BINDINGS_STORAGE_KEY, serializeBindings(bindings));
  } catch {
    // Private mode or a full quota: bindings last this session only.
  }
}

function sameMessage(b: MidiBinding, deviceName: string, msg: IncomingMessage): boolean {
  return b.deviceName === deviceName && b.kind === msg.kind && b.channel === msg.channel && b.number === msg.number;
}

export function findBinding(
  bindings: readonly MidiBinding[],
  deviceName: string,
  msg: IncomingMessage,
): MidiBinding | null {
  return bindings.find((b) => sameMessage(b, deviceName, msg)) ?? null;
}

/** Adds a binding, first dropping any on the same message or for the same target. */
export function bindTarget(
  bindings: readonly MidiBinding[],
  deviceName: string,
  msg: IncomingMessage,
  target: LearnTarget,
): MidiBinding[] {
  const key = targetKey(target);
  const kept = bindings.filter((b) => !sameMessage(b, deviceName, msg) && targetKey(b.target) !== key);
  return [...kept, { deviceName, kind: msg.kind, channel: msg.channel, number: msg.number, target }];
}

export interface LearnResult {
  /** True when this message was taken as the answer, so it must not also fire. */
  consumed: boolean;
  learning: LearnTarget | null;
  bindings: readonly MidiBinding[];
}

/** One step of the learn machine: the next note-on or CC above zero binds. */
export function learnStep(
  learning: LearnTarget | null,
  bindings: readonly MidiBinding[],
  deviceName: string,
  msg: IncomingMessage,
): LearnResult {
  if (!learning || msg.value === 0) return { consumed: false, learning, bindings };
  // A knob target cannot be answered by a button: keep waiting, but swallow it.
  if (needsContinuous(learning) && msg.kind !== "cc") return { consumed: true, learning, bindings };
  return { consumed: true, learning: null, bindings: bindTarget(bindings, deviceName, msg, learning) };
}

/** What a bound message means: the target, whether it is down, and its 0 to 1 level. */
export interface BoundEvent {
  target: LearnTarget;
  down: boolean;
  /** Value / 127. */
  level: number;
  /** Set for a note only: a CC has no velocity worth passing. */
  velocity?: number;
}

export function resolveBound(binding: MidiBinding, msg: IncomingMessage): BoundEvent {
  const level = msg.value / 127;
  const event: BoundEvent = { target: binding.target, down: msg.value > 0, level };
  if (binding.kind === "note" && msg.value > 0) event.velocity = level;
  return event;
}
