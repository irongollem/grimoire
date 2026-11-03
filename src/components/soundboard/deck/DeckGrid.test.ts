import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DeckGrid from "./DeckGrid.vue";
import { fixtureCell, fixtureEmpty, fixtureLanes } from "./deckFixtures";
import type { DeckCellView } from "@/lib/audio/deck/deckSurface";

function board(): DeckCellView[] {
  const out: DeckCellView[] = [];
  for (let row = 0; row < 2; row++) {
    for (let lane = 0; lane < 8; lane++) {
      out.push(lane === 7 && row === 1 ? fixtureEmpty(lane, row) : fixtureCell({ lane, row, padId: `p${lane}-${row}`, name: `Pad ${lane}-${row}` }));
    }
  }
  return out;
}

function mountGrid(extra: Record<string, unknown> = {}) {
  return mount(DeckGrid, {
    props: { lanes: fixtureLanes(), cells: board(), rows: 2, size: "md", controls: "full", tool: "play", mode: "play", ...extra },
  });
}

describe("DeckGrid", () => {
  it("names the true lane and row on a press when the phone shows lanes 4 to 7", async () => {
    // A phone page starts at lane 4; reporting the column index (0) would fire the wrong pad.
    const w = mountGrid({ laneStart: 4, laneCount: 4 });
    const pad = w.find("[data-cell='5:1'] button");
    await pad.trigger("pointerdown", { button: 0 });
    await pad.trigger("pointerup");
    expect(w.emitted("press")).toEqual([[{ lane: 5, row: 1 }]]);
    expect(w.emitted("release")).toEqual([[{ lane: 5, row: 1 }]]);
  });

  it("draws only the lanes in the window", () => {
    const w = mountGrid({ laneStart: 4, laneCount: 4 });
    expect(w.findAll("[data-cell]")).toHaveLength(8);
    expect(w.find("[data-cell='3:0']").exists()).toBe(false);
    expect(w.find("[data-cell='4:0']").exists()).toBe(true);
  });

  it("leaves lane headers inert while playing and makes them buttons in build mode", async () => {
    const play = mountGrid();
    expect(play.findAll("[role=row] button")).toHaveLength(0);
    const build = mountGrid({ mode: "build" });
    await build.findAll("[role=row] button")[2]?.trigger("click");
    expect(build.emitted("laneActivate")).toEqual([[2]]);
  });

  it("reports a drop on the slot it landed on, and only in build mode", async () => {
    const build = mountGrid({ mode: "build" });
    await build.find("[data-cell='7:1']").trigger("drop");
    expect(build.emitted("drop")?.[0]?.[0]).toMatchObject({ lane: 7, row: 1 });
    const play = mountGrid();
    await play.find("[data-cell='7:1']").trigger("drop");
    expect(play.emitted("drop")).toBeUndefined();
  });

  it("selects an empty slot with a null pad id so the builder can fill it", async () => {
    const w = mountGrid({ mode: "build" });
    await w.find("[data-cell='7:1'] button").trigger("click");
    expect(w.emitted("select")).toEqual([[{ lane: 7, row: 1, padId: null }]]);
  });
});
