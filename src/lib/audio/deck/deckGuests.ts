/**
 * Guest pads (#1136): audio the campaign started by itself (a fight's music, the
 * party's place, a beat's cue) shown on the deck so it can be stopped from there.
 * Pure: the snapshot supplies the triggers and the pads, this decides where each
 * guest stands.
 */

import type { DeckFeed, DeckLane, SoundCategory } from "@/types/sound.types";
import { soundIdOfTarget } from "@/lib/audio/audioTriggers";
import { laneForFeed } from "./deckModel";
import type { DeckGuest } from "./deckSurface";

/** The part of an active trigger this module reads. */
export interface GuestTrigger {
  sourceId: string;
  label: string;
  kind: "encounter" | "location" | "beat";
  slot: "music" | "ambient";
  /** A playlist id, or `sound:<id>` for a loose file. */
  target: string;
}

export interface PlacedGuest extends DeckGuest {
  lane: number;
  row: number;
}

/** The playlist or sound id behind a trigger target. */
export function targetId(target: string): string {
  const soundId = soundIdOfTarget(target);
  return soundId === null ? target : soundId;
}

/**
 * Which lane feed takes a trigger's audio, or null when it gets no pad: a
 * beat's one-shot effect ends by itself and stays in the Now chips only.
 */
export function feedOfTrigger(
  trigger: Pick<GuestTrigger, "kind" | "slot" | "target">,
  soundCategory: (soundId: string) => SoundCategory | undefined,
): DeckFeed | null {
  if (trigger.slot === "music") return "music";
  if (trigger.kind === "location") return "place";
  const soundId = soundIdOfTarget(trigger.target);
  if (soundId !== null && soundCategory(soundId) === "effects") return null;
  return "ambience";
}

export interface PlaceGuestsInput {
  lanes: readonly DeckLane[];
  /** Playlist ids and take sound ids the pads on this page hold. */
  heldIds: ReadonlySet<string>;
  /** Slots the pads on this page occupy. */
  occupied: readonly { lane: number; row: number }[];
  /** Only the audible ones, music top first. */
  triggers: readonly GuestTrigger[];
  soundCategory: (soundId: string) => SoundCategory | undefined;
}

/** Each audible trigger without a pad of its own takes the first empty row of its feed's lane. */
export function placeGuests(input: PlaceGuestsInput): PlacedGuest[] {
  const taken = new Set(input.occupied.map((slot) => `${slot.lane}:${slot.row}`));
  const seen = new Set<string>();
  const placed: PlacedGuest[] = [];
  for (const trigger of input.triggers) {
    if (seen.has(trigger.target)) continue;
    seen.add(trigger.target);
    if (input.heldIds.has(targetId(trigger.target))) continue; // That pad lights instead.
    const feed = feedOfTrigger(trigger, input.soundCategory);
    if (feed === null) continue;
    const lane = laneForFeed(input.lanes, feed);
    if (lane === null) continue;
    let row = 0;
    while (taken.has(`${lane}:${row}`)) row += 1;
    taken.add(`${lane}:${row}`);
    placed.push({ sourceId: trigger.sourceId, label: trigger.label, target: trigger.target, lane, row });
  }
  return placed;
}
