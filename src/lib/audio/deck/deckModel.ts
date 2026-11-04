/**
 * The deck's rules in one pure place (#1136): what a pad's null settings mean,
 * where pads sit on the grid, and how a take is varied. Vue-free, so the store,
 * the screen and a hardware driver all read the same answers.
 */

import type { DeckFeed, DeckLane, LaunchMode, SoundCategory, SoundboardPad } from "@/types/sound.types";
import type { DeckCellView, DeckPadKind } from "./deckSurface";
import { DECK_LANES } from "./deckSurface";

/** The highest grid_row the database allows is 255. */
export const MAX_GRID_ROWS = 256;

/**
 * Equal to the default of `soundboard_pages.lanes`, as a fresh array per call.
 *
 * A function, not a module constant, on purpose. The production bundler wraps
 * this module in a lazy initialiser, so an exported `const` is only assigned
 * once that initialiser has run, while a function declaration exists from the
 * moment the chunk loads. As a constant it was read as `undefined` by the deck
 * snapshot on a screen with no page loaded yet (Sentry DUNGEON-GRIMOIRE-Y/Z),
 * which took the whole layout down with it.
 */
export function defaultLanes(): DeckLane[] {
  return [
    { name: "Music", rule: "one", feed: "music" },
    { name: "Place", rule: "one", feed: "place" },
    { name: "Ambience", rule: "together", feed: "ambience" },
    { name: "Effects", rule: "together" },
    { name: "Effects", rule: "together" },
    { name: "Effects", rule: "together" },
    { name: "Effects", rule: "together" },
    { name: "Stingers", rule: "together" },
  ];
}

/**
 * The lanes the deck lays out for a page: its own, or the defaults when there
 * is no page (nothing loaded yet, or a campaign with no pages) or the row came
 * back without them. The deck draws in the layout on every screen, so a
 * missing array must cost one page's lane names, never the app.
 */
export function pageLanes(page: { lanes?: DeckLane[] | null } | null | undefined): DeckLane[] {
  const lanes = page ? page.lanes : undefined;
  return Array.isArray(lanes) ? lanes : defaultLanes();
}

const LANE_NAME_MAX = 40;

const FEEDS: ReadonlySet<unknown> = new Set<DeckFeed>(["music", "place", "ambience"]);

/**
 * Mirrors the database CHECK: eight lanes, a 1 to 40 character name, rule one
 * or together, an optional feed, and no feed in two lanes.
 */
export function isValidLanes(lanes: unknown): lanes is DeckLane[] {
  if (!Array.isArray(lanes) || lanes.length !== DECK_LANES) return false;
  const feeds: unknown[] = [];
  const wellFormed = lanes.every((lane: unknown) => {
    if (typeof lane !== "object" || lane === null) return false;
    const { name, rule, feed } = lane as Record<string, unknown>;
    if (feed !== undefined && feed !== null) {
      if (!FEEDS.has(feed)) return false;
      feeds.push(feed);
    }
    return (
      typeof name === "string" &&
      name.trim().length >= 1 &&
      name.length <= LANE_NAME_MAX &&
      (rule === "one" || rule === "together")
    );
  });
  return wellFormed && new Set(feeds).size === feeds.length;
}

/** The lane on a page that takes a feed, or null when none does. */
export function laneForFeed(lanes: readonly DeckLane[], feed: DeckFeed): number | null {
  const index = lanes.findIndex((lane) => lane.feed === feed);
  return index === -1 ? null : index;
}

// ── Kind, category, defaults ──────────────────────────────────────────────

/**
 * What a pad is. A pad on a playlist is a scene (ambient) or a music playlist;
 * a pad on no playlist plays its takes. Null when the playlist is not in the
 * map: the pad dangles and must not play.
 */
export function padKind(
  pad: Pick<SoundboardPad, "playlist_id">,
  playlistsById: ReadonlyMap<string, { playlist_type: "music" | "ambient" }>,
): DeckPadKind | null {
  if (pad.playlist_id === null) return "sound";
  const playlist = playlistsById.get(pad.playlist_id);
  if (!playlist) return null;
  return playlist.playlist_type === "ambient" ? "scene" : "playlist";
}

export function padCategory(kind: DeckPadKind, firstTakeCategory: SoundCategory | null): SoundCategory {
  if (kind === "scene") return "ambient";
  if (kind === "playlist") return "music";
  return firstTakeCategory ?? "effects";
}

export function defaultLaunchMode(category: SoundCategory, kind: DeckPadKind): LaunchMode {
  if (kind !== "sound") return "toggle";
  return category === "effects" ? "trigger" : "toggle";
}

export function effectiveLaunchMode(
  pad: Pick<SoundboardPad, "launch_mode">,
  category: SoundCategory,
  kind: DeckPadKind,
): LaunchMode {
  return pad.launch_mode ?? defaultLaunchMode(category, kind);
}

export function isDefaultLaunchMode(
  pad: Pick<SoundboardPad, "launch_mode">,
  category: SoundCategory,
  kind: DeckPadKind,
): boolean {
  return pad.launch_mode === null || pad.launch_mode === defaultLaunchMode(category, kind);
}

export function defaultLoop(category: SoundCategory, kind: DeckPadKind): boolean {
  if (kind === "scene") return true;
  if (kind === "playlist") return false;
  return category !== "effects";
}

export function effectiveLoop(pad: Pick<SoundboardPad, "loop">, category: SoundCategory, kind: DeckPadKind): boolean {
  return pad.loop ?? defaultLoop(category, kind);
}

export const DEFAULT_FADES: Record<SoundCategory, { inMs: number; outMs: number }> = {
  music: { inMs: 1000, outMs: 1500 },
  ambient: { inMs: 1200, outMs: 1200 },
  effects: { inMs: 0, outMs: 150 },
};

export function effectiveFades(
  pad: Pick<SoundboardPad, "fade_in_ms" | "fade_out_ms">,
  category: SoundCategory,
): { inMs: number; outMs: number } {
  const base = DEFAULT_FADES[category];
  return { inMs: pad.fade_in_ms ?? base.inMs, outMs: pad.fade_out_ms ?? base.outMs };
}

// ── Grid ──────────────────────────────────────────────────────────────────

type Slot = Pick<SoundboardPad, "lane" | "grid_row">;

/** Rows the page needs to show: one past the lowest pad, never fewer than one. */
export function rowsForPage(pads: readonly Slot[]): number {
  return pads.reduce((rows, pad) => Math.max(rows, pad.grid_row + 1), 1);
}

export function padAt<T extends Slot>(pads: readonly T[], lane: number, row: number): T | null {
  return pads.find((pad) => pad.lane === lane && pad.grid_row === row) ?? null;
}

/** The first empty row in the preferred lane; a full lane falls back to the first empty slot row-major. */
export function firstFreeSlot(pads: readonly Slot[], preferredLane: number): { lane: number; row: number } {
  const taken = new Set(pads.map((pad) => `${pad.lane}:${pad.grid_row}`));
  for (let row = 0; row < MAX_GRID_ROWS; row++) {
    if (!taken.has(`${preferredLane}:${row}`)) return { lane: preferredLane, row };
  }
  for (let row = 0; row < MAX_GRID_ROWS; row++) {
    for (let lane = 0; lane < DECK_LANES; lane++) {
      if (!taken.has(`${lane}:${row}`)) return { lane, row };
    }
  }
  throw new Error("The deck is full");
}

/** The category most of a lane's pads share; ties and an empty lane read as effects. */
export function laneCategory(categories: readonly SoundCategory[]): SoundCategory {
  const counts: Record<SoundCategory, number> = { music: 0, ambient: 0, effects: 0 };
  for (const category of categories) counts[category] += 1;
  const top = Math.max(counts.music, counts.ambient, counts.effects);
  const leaders = (["music", "ambient", "effects"] as const).filter((category) => counts[category] === top);
  const [only] = leaders;
  return leaders.length === 1 && only ? only : "effects";
}

// ── Takes and velocity ────────────────────────────────────────────────────

export function nextTakeIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

/** A little pitch and loudness drift so a repeated sound does not machine-gun. */
export function takeVariation(rng: () => number): { rate: number; gain: number } {
  return { rate: 0.96 + rng() * 0.08, gain: 0.88 + rng() * 0.12 };
}

export type VelocityCurve = "gentle" | "even" | "punchy";

export function velocityGain(velocity: number, curve: VelocityCurve): number {
  const v = Math.min(1, Math.max(0, velocity));
  const shaped = curve === "gentle" ? Math.sqrt(v) : curve === "punchy" ? v * v : v;
  return Math.min(1, Math.max(0.05, shaped));
}

/**
 * The number key that fires a pad, "1" to "8": keys answer to the row in view
 * (`keyRow`), so only that row has them.
 */
export function rowKey(lane: number, row: number, keyRow: number): string | null {
  if (row !== keyRow || lane < 0 || lane >= DECK_LANES) return null;
  return String(lane + 1);
}

/** The row keys 1 to 8 fire: the one a screen says is in view, kept on the page. */
export function keyRowFor(rowInView: number, rows: number): number {
  return Math.min(Math.max(0, rowInView), Math.max(0, rows - 1));
}

/** A slot with nothing in it, in every surface's terms. */
export function emptyDeckCell(lane: number, row: number): DeckCellView {
  return {
    lane,
    row,
    padId: null,
    guest: null,
    kind: null,
    category: null,
    name: "",
    light: "off",
    loop: false,
    mode: "trigger",
    modeIsDefault: true,
    takes: 0,
    nextTake: 0,
    progress: 0,
    volume: 0,
    soloed: false,
    blockedReason: null,
    meta: null,
    keyLabel: null,
  };
}
