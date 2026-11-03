import type { DeckCellView, DeckLaneView } from "@/lib/audio/deck/deckSurface";

/** A cell with sensible defaults, for the dev catalogue and the tests. */
export function fixtureCell(over: Partial<DeckCellView> = {}): DeckCellView {
  return {
    lane: 0,
    row: 0,
    padId: "pad-1",
    kind: "sound",
    category: "effects",
    name: "Door slam",
    light: "ready",
    loop: false,
    mode: "trigger",
    modeIsDefault: true,
    takes: 0,
    nextTake: 0,
    progress: 0,
    volume: 0.7,
    soloed: false,
    blockedReason: null,
    meta: null,
    keyLabel: null,
    ...over,
  };
}

/** A slot with nothing in it. */
export function fixtureEmpty(lane = 0, row = 0): DeckCellView {
  return fixtureCell({
    lane,
    row,
    padId: null,
    kind: null,
    category: null,
    name: "",
    light: "off",
    takes: 0,
    volume: 0,
  });
}

export function fixtureLanes(): DeckLaneView[] {
  const names = ["Tavern", "Road", "Dungeon", "Combat", "Town", "Weather", "Stings", "Spare"];
  return names.map((name, i) => ({
    name,
    rule: i % 3 === 0 ? "one" : "together",
    category: i % 3 === 0 ? "music" : i % 3 === 1 ? "ambient" : "effects",
  }));
}
