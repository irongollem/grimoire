import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANES,
  effectiveFades,
  effectiveLaunchMode,
  effectiveLoop,
  firstFreeSlot,
  isDefaultLaunchMode,
  isValidLanes,
  laneForFeed,
  laneCategory,
  nextTakeIndex,
  padAt,
  padCategory,
  padKind,
  rowsForPage,
  takeVariation,
  keyRowFor,
  rowKey,
  velocityGain,
  defaultLaunchMode,
  defaultLoop,
} from "./deckModel";

describe("isValidLanes", () => {
  it("accepts the default lanes", () => {
    expect(isValidLanes(DEFAULT_LANES)).toBe(true);
  });

  it("refuses seven or nine lanes, which the database would reject", () => {
    expect(isValidLanes(DEFAULT_LANES.slice(0, 7))).toBe(false);
    expect(isValidLanes([...DEFAULT_LANES, DEFAULT_LANES[0]])).toBe(false);
  });

  it("refuses an empty, over-long or non-string name and an unknown rule", () => {
    const with0 = (lane: unknown) => [lane, ...DEFAULT_LANES.slice(1)];
    expect(isValidLanes(with0({ name: "", rule: "one" }))).toBe(false);
    expect(isValidLanes(with0({ name: "x".repeat(41), rule: "one" }))).toBe(false);
    expect(isValidLanes(with0({ name: "x".repeat(40), rule: "one" }))).toBe(true);
    expect(isValidLanes(with0({ name: 3, rule: "one" }))).toBe(false);
    expect(isValidLanes(with0({ name: "A", rule: "many" }))).toBe(false);
    expect(isValidLanes(with0(null))).toBe(false);
    expect(isValidLanes("lanes")).toBe(false);
  });

  // Each fails if its check is gone: the database refuses both, so the lane
  // editor would save something the server throws back.
  it("refuses an unknown feed", () => {
    const lanes = DEFAULT_LANES.map((lane, i) => (i === 3 ? { ...lane, feed: "combat" } : lane));
    expect(isValidLanes(lanes)).toBe(false);
  });

  it("refuses one feed in two lanes, so a trigger always knows where it goes", () => {
    const lanes = DEFAULT_LANES.map((lane, i) => (i === 3 ? { ...lane, feed: "music" as const } : lane));
    expect(isValidLanes(lanes)).toBe(false);
  });
});

describe("laneForFeed", () => {
  it("finds the lane that takes a feed, and none when no lane does", () => {
    expect(laneForFeed(DEFAULT_LANES, "place")).toBe(1);
    const noMusic = DEFAULT_LANES.map((lane) => (lane.feed === "music" ? { ...lane, feed: null } : lane));
    expect(laneForFeed(noMusic, "music")).toBeNull();
  });
});

describe("padKind", () => {
  const playlists = new Map<string, { playlist_type: "music" | "ambient" }>([
    ["m", { playlist_type: "music" }],
    ["a", { playlist_type: "ambient" }],
  ]);

  it("tells a scene, a playlist and a sound pad apart", () => {
    expect(padKind({ playlist_id: "a" }, playlists)).toBe("scene");
    expect(padKind({ playlist_id: "m" }, playlists)).toBe("playlist");
    expect(padKind({ playlist_id: null }, playlists)).toBe("sound");
  });

  it("is null for a pad whose playlist is gone, so it never plays as a sound", () => {
    expect(padKind({ playlist_id: "deleted" }, playlists)).toBeNull();
  });
});

describe("category and defaults", () => {
  it("a scene is ambient and a playlist is music whatever a take says", () => {
    expect(padCategory("scene", "effects")).toBe("ambient");
    expect(padCategory("playlist", "effects")).toBe("music");
    expect(padCategory("sound", "music")).toBe("music");
    expect(padCategory("sound", null)).toBe("effects");
  });

  it("effects trigger, everything else toggles", () => {
    expect(defaultLaunchMode("effects", "sound")).toBe("trigger");
    expect(defaultLaunchMode("music", "sound")).toBe("toggle");
    expect(defaultLaunchMode("ambient", "sound")).toBe("toggle");
    expect(defaultLaunchMode("effects", "scene")).toBe("toggle");
    expect(defaultLaunchMode("music", "playlist")).toBe("toggle");
  });

  it("a set launch mode wins over the default, and null means default", () => {
    expect(effectiveLaunchMode({ launch_mode: "gate" }, "effects", "sound")).toBe("gate");
    expect(effectiveLaunchMode({ launch_mode: null }, "effects", "sound")).toBe("trigger");
    expect(isDefaultLaunchMode({ launch_mode: null }, "effects", "sound")).toBe(true);
    expect(isDefaultLaunchMode({ launch_mode: "trigger" }, "effects", "sound")).toBe(true);
    expect(isDefaultLaunchMode({ launch_mode: "gate" }, "effects", "sound")).toBe(false);
  });

  it("loops music and ambient sounds and scenes, not effects or playlists", () => {
    expect(defaultLoop("music", "sound")).toBe(true);
    expect(defaultLoop("ambient", "sound")).toBe(true);
    expect(defaultLoop("effects", "sound")).toBe(false);
    expect(defaultLoop("ambient", "scene")).toBe(true);
    expect(defaultLoop("music", "playlist")).toBe(false);
  });

  it("an explicit loop false survives (not coerced to the default)", () => {
    expect(effectiveLoop({ loop: false }, "music", "sound")).toBe(false);
    expect(effectiveLoop({ loop: null }, "music", "sound")).toBe(true);
  });

  it("fades default per category and a pad's zero is a real override", () => {
    expect(effectiveFades({ fade_in_ms: null, fade_out_ms: null }, "music")).toEqual({ inMs: 1000, outMs: 1500 });
    expect(effectiveFades({ fade_in_ms: null, fade_out_ms: null }, "ambient")).toEqual({ inMs: 1200, outMs: 1200 });
    expect(effectiveFades({ fade_in_ms: null, fade_out_ms: null }, "effects")).toEqual({ inMs: 0, outMs: 150 });
    expect(effectiveFades({ fade_in_ms: 0, fade_out_ms: 400 }, "music")).toEqual({ inMs: 0, outMs: 400 });
  });
});

describe("grid", () => {
  const pads = [
    { lane: 0, grid_row: 0 },
    { lane: 0, grid_row: 1 },
    { lane: 2, grid_row: 4 },
  ];

  it("shows one past the lowest pad and at least one row", () => {
    expect(rowsForPage([])).toBe(1);
    expect(rowsForPage(pads)).toBe(5);
  });

  it("finds the pad in a slot, or null", () => {
    expect(padAt(pads, 2, 4)).toBe(pads[2]);
    expect(padAt(pads, 2, 3)).toBeNull();
  });

  it("puts a new pad in the first hole of the preferred lane", () => {
    expect(firstFreeSlot(pads, 0)).toEqual({ lane: 0, row: 2 });
    expect(firstFreeSlot([{ lane: 1, grid_row: 1 }], 1)).toEqual({ lane: 1, row: 0 });
    expect(firstFreeSlot([], 5)).toEqual({ lane: 5, row: 0 });
  });

  it("a full lane falls back to the first free slot, row-major", () => {
    const full = Array.from({ length: 256 }, (_, row) => ({ lane: 3, grid_row: row }));
    expect(firstFreeSlot([...full, { lane: 0, grid_row: 0 }], 3)).toEqual({ lane: 1, row: 0 });
  });

  it("throws when every slot is taken instead of returning an occupied one", () => {
    const all = Array.from({ length: 256 * 8 }, (_, i) => ({ lane: i % 8, grid_row: Math.floor(i / 8) }));
    expect(() => firstFreeSlot(all, 0)).toThrow();
  });

  it("names a lane by its most common category, ties and empty to effects", () => {
    expect(laneCategory(["music", "music", "effects"])).toBe("music");
    expect(laneCategory(["ambient", "ambient", "music"])).toBe("ambient");
    expect(laneCategory(["music", "ambient"])).toBe("effects");
    expect(laneCategory([])).toBe("effects");
  });
});

describe("takes and velocity", () => {
  it("round-robins and survives an empty or shrunk list", () => {
    expect(nextTakeIndex(0, 3)).toBe(1);
    expect(nextTakeIndex(2, 3)).toBe(0);
    expect(nextTakeIndex(5, 0)).toBe(0);
    expect(nextTakeIndex(4, 2)).toBe(1);
  });

  it("varies rate within 0.96 to 1.04 and gain within 0.88 to 1.0", () => {
    expect(takeVariation(() => 0)).toEqual({ rate: 0.96, gain: 0.88 });
    const hi = takeVariation(() => 1);
    expect(hi.rate).toBeCloseTo(1.04);
    expect(hi.gain).toBeCloseTo(1);
    const mid = takeVariation(() => 0.5);
    expect(mid.rate).toBeCloseTo(1);
    expect(mid.gain).toBeCloseTo(0.94);
  });

  it("shapes velocity by curve and clamps both ends", () => {
    expect(velocityGain(0.25, "even")).toBe(0.25);
    expect(velocityGain(0.25, "gentle")).toBeCloseTo(0.5);
    expect(velocityGain(0.5, "punchy")).toBeCloseTo(0.25);
    expect(velocityGain(0, "even")).toBe(0.05);
    expect(velocityGain(2, "even")).toBe(1);
    expect(velocityGain(-1, "gentle")).toBe(0.05);
  });

  it("only the row in view has number keys", () => {
    expect(rowKey(0, 0, 0)).toBe("1");
    expect(rowKey(7, 2, 2)).toBe("8");
    expect(rowKey(3, 0, 2)).toBeNull();
    expect(rowKey(8, 2, 2)).toBeNull();
  });

  it("keeps the key row on the page when the page is shorter than where the screen was", () => {
    expect(keyRowFor(5, 3)).toBe(2);
    expect(keyRowFor(1, 3)).toBe(1);
    expect(keyRowFor(-1, 3)).toBe(0);
    expect(keyRowFor(4, 0)).toBe(0);
  });
});
