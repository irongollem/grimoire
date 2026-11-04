import { describe, expect, it } from "vitest";
import { defaultLanes } from "./deckModel";
import { feedOfTrigger, placeGuests, targetId, type GuestTrigger } from "./deckGuests";
import type { DeckLane } from "@/types/sound.types";

const none = () => undefined;
function trig(over: Partial<GuestTrigger> & { sourceId: string }): GuestTrigger {
  return { label: `from ${over.sourceId}`, kind: "encounter", slot: "music", target: `pl-${over.sourceId}`, ...over };
}
function place(over: Partial<Parameters<typeof placeGuests>[0]>) {
  return placeGuests({ lanes: defaultLanes(), heldIds: new Set(), occupied: [], triggers: [], soundCategory: none, ...over });
}

describe("feedOfTrigger", () => {
  it("sends music to music, a location's ambience to place, other ambience to ambience (fails if the slot or kind were ignored)", () => {
    expect(feedOfTrigger(trig({ sourceId: "a", slot: "music", kind: "location" }), none)).toBe("music");
    expect(feedOfTrigger(trig({ sourceId: "a", slot: "ambient", kind: "location" }), none)).toBe("place");
    expect(feedOfTrigger(trig({ sourceId: "a", slot: "ambient", kind: "beat" }), none)).toBe("ambience");
  });

  it("gives a beat's loose effect no feed (fails if a one-shot got a pad that vanishes at once)", () => {
    const t = trig({ sourceId: "a", slot: "ambient", kind: "beat", target: "sound:s1" });
    expect(feedOfTrigger(t, () => "effects")).toBeNull();
    expect(feedOfTrigger(t, () => "ambient")).toBe("ambience");
  });
});

describe("placeGuests", () => {
  it("skips a trigger whose target a pad on the page holds (fails if the pad and a guest both showed)", () => {
    expect(place({ triggers: [trig({ sourceId: "a" })], heldIds: new Set(["pl-a"]) })).toEqual([]);
    // A loose sound is held by its take's sound id.
    const loose = trig({ sourceId: "b", slot: "ambient", kind: "beat", target: "sound:s9" });
    expect(place({ triggers: [loose], heldIds: new Set(["s9"]) })).toEqual([]);
  });

  it("takes the first empty row top-down, past pads and earlier guests (fails if it overwrote a pad)", () => {
    const placed = place({
      triggers: [trig({ sourceId: "a" }), trig({ sourceId: "b", slot: "music" })],
      occupied: [{ lane: 0, row: 0 }, { lane: 0, row: 2 }],
    });
    expect(placed.map((g) => [g.sourceId, g.lane, g.row])).toEqual([["a", 0, 1], ["b", 0, 3]]);
  });

  it("drops a trigger whose feed has no lane on the page (fails if it landed in lane 0)", () => {
    const lanes: DeckLane[] = defaultLanes().map((lane) => (lane.feed === "place" ? { name: lane.name, rule: lane.rule } : lane));
    const t = trig({ sourceId: "a", slot: "ambient", kind: "location" });
    expect(place({ lanes, triggers: [t] })).toEqual([]);
  });

  it("drops a beat's effect one-shot", () => {
    const t = trig({ sourceId: "a", slot: "ambient", kind: "beat", target: "sound:s1" });
    expect(place({ triggers: [t], soundCategory: () => "effects" })).toEqual([]);
  });

  it("drops an effect one-shot even when the page has a lane whose feed is explicitly null (fails if the null feed were looked up as a lane)", () => {
    const lanes: DeckLane[] = defaultLanes().map((lane) => (lane.feed === undefined ? { ...lane, feed: null } : lane));
    const t = trig({ sourceId: "a", slot: "ambient", kind: "beat", target: "sound:s1" });
    expect(place({ lanes, triggers: [t], soundCategory: () => "effects" })).toEqual([]);
  });

  it("shows one guest per target (fails if a trigger held twice made two pads)", () => {
    const placed = place({ triggers: [trig({ sourceId: "a", target: "x" }), trig({ sourceId: "b", target: "x" })] });
    expect(placed).toHaveLength(1);
  });
});

describe("targetId", () => {
  it("strips the sound prefix only", () => {
    expect(targetId("sound:abc")).toBe("abc");
    expect(targetId("abc")).toBe("abc");
  });
});
