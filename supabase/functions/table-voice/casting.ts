// Casting a character from the voice registry (#1272). Pure: no I/O. What is read (the slots, who has which at a
// place) and the one judgment (Jev picking the slot that fits) come in as arguments, so every rule here is tested
// without a database. `handler.ts` fetches and calls; this file only decides.
//
// A slot is a kind of voice ("Shady guy", "Old woman, frail") with one voice filling it. A character is matched to a
// slot, never to a raw voice id, so filling a slot with a better voice re-voices everyone cast to it.

import type { AgeBand, Sex } from "./voicePick.ts";

/** A filled, active slot, as the caller's own client reads it. */
export interface VoiceSlot {
  id: string;
  name: string;
  /** Who the voice fits, in words: what a character's record is matched against. */
  description: string;
  sex: Sex | null;
  age: AgeBand | null;
  service: "elevenlabs" | "inworld";
  voiceId: string;
}

/** Who else holds which slot in the campaign: one row per character that has one. */
export interface SlotAssignment {
  npcId: string;
  slotId: string;
  locationId: string | null;
}

/** How many slots Jev is shown at once: more than this and the answer is a guess among noise. */
export const JEV_MAX_OPTIONS = 40;

/** A small stable number from a key (FNV-1a), so the same character is always cast the same. */
export function hashOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Narrowed by sex when known, then by age when known. A step that would leave nobody is skipped, so a character no
 * slot fits exactly is still cast from the nearest, and a stranger of no known sex is cast from everyone.
 */
export function narrowByTraits(pool: readonly VoiceSlot[], traits: { sex: Sex | null; age: AgeBand | null }): VoiceSlot[] {
  const bySex = traits.sex === null ? pool : pool.filter((s) => s.sex === traits.sex);
  const afterSex = bySex.length > 0 ? bySex : pool;
  const byAge = traits.age === null ? afterSex : afterSex.filter((s) => s.age === traits.age);
  return [...(byAge.length > 0 ? byAge : afterSex)];
}

/** How many characters of the campaign hold each slot. */
export function useCounts(assignments: readonly SlotAssignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assignments) counts.set(a.slotId, (counts.get(a.slotId) ?? 0) + 1);
  return counts;
}

/** Slots already held by ANOTHER character at this place: two people in one tavern should not share a voice. */
export function usedAtPlace(assignments: readonly SlotAssignment[], npcId: string, locationId: string | null): Set<string> {
  if (locationId === null) return new Set();
  return new Set(assignments.filter((a) => a.locationId === locationId && a.npcId !== npcId).map((a) => a.slotId));
}

/** Least used in the campaign first; ties broken by the character's key, so the order is stable and still spread. */
export function byLeastUsed(slots: readonly VoiceSlot[], counts: ReadonlyMap<string, number>, key: string): VoiceSlot[] {
  const use = (s: VoiceSlot): number => counts.get(s.id) ?? 0;
  return [...slots].sort((a, b) => use(a) - use(b) || hashOf(`${key}:${a.id}`) - hashOf(`${key}:${b.id}`) || a.id.localeCompare(b.id));
}

/** murmur3's finaliser: FNV alone ranks near-identical strings ("…:s1", "…:s10") alike, so one slot won too often. */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The same character always gets the same slot from a pool: for someone with no record, and for a player's character,
 * neither of which has a row to keep a cast on. Highest score wins (rendezvous hashing), not `hash % length`: with a
 * modulo, adding or retiring one slot moved almost every such speaker to another voice, so a player's character
 * sounded different the next sitting (25 Nov 2026). Now a speaker moves only when its own slot goes, or a new slot
 * outscores it, about one in the pool's size.
 */
export function pickByKey(key: string, pool: readonly VoiceSlot[], traits: { sex: Sex | null; age: AgeBand | null } = { sex: null, age: null }): VoiceSlot {
  const cast = narrowByTraits(pool, traits);
  const score = (s: VoiceSlot): number => mix(hashOf(`${key}:${s.id}`));
  return cast.reduce((best, s) => (score(s) > score(best) || (score(s) === score(best) && s.id < best.id) ? s : best));
}

/** What a judgment is asked and what it answered: the name of the slot it chose, and the tokens it spent. */
export interface Judgment {
  choice: string | null;
  inputTokens: number;
}

export interface NpcCastInput {
  npcId: string;
  traits: { sex: Sex | null; age: AgeBand | null };
  /** Text the character is matched on: occupation, appearance, personality, voice. Never backstory or notes. */
  fitting: string;
  locationId: string | null;
  /** The filled, active cast slots on services this stack can speak through. */
  pool: readonly VoiceSlot[];
  assignments: readonly SlotAssignment[];
}

/**
 * Casts a character with a record: narrow by what the record says, step aside from voices already used at this place,
 * then let `judge` pick the slot that fits among what is left (the 40 least used, if there are more). Where there is
 * no judgment, or it fails or names nothing offered, the least used slot in the campaign is taken. Null only when the
 * pool is empty. `inputTokens` is what the judgment spent (0 when it did not run), for the ledger.
 */
export async function castNpc(input: NpcCastInput, judge: (options: Array<{ name: string; description: string }>, fitting: string) => Promise<Judgment | null>): Promise<{ slot: VoiceSlot; inputTokens: number } | null> {
  if (input.pool.length === 0) return null;
  const narrowed = narrowByTraits(input.pool, input.traits);
  const taken = usedAtPlace(input.assignments, input.npcId, input.locationId);
  const free = narrowed.filter((s) => !taken.has(s.id));
  // Stepping aside only when somebody is left: a small registry may have to repeat a voice.
  const candidates = free.length > 0 ? free : narrowed;
  const ranked = byLeastUsed(candidates, useCounts(input.assignments), input.npcId);
  const shown = ranked.slice(0, JEV_MAX_OPTIONS);

  // Two slots may share a name; the model answers by name, so the later one is told apart.
  const byName = new Map<string, VoiceSlot>();
  for (const slot of shown) {
    let name = slot.name;
    for (let n = 2; byName.has(name); n++) name = `${slot.name} (${n})`;
    byName.set(name, slot);
  }

  let judged: Judgment | null = null;
  try {
    judged = await judge([...byName].map(([name, slot]) => ({ name, description: slot.description })), input.fitting);
  } catch (error) {
    console.error("table-voice: judging the voice failed:", error);
  }
  const chosen = judged?.choice != null ? byName.get(judged.choice) : undefined;
  return { slot: chosen ?? shown[0], inputTokens: judged?.inputTokens ?? 0 };
}
