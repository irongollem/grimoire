import { describe, expect, it } from "vitest";
import { createHoldTap, TAP_MS } from "./holdTap";
import type { DeckPhase } from "./deckSurface";

function rig() {
  let t = 1000;
  const phases: DeckPhase[] = [];
  const send = (p: DeckPhase) => void phases.push(p);
  return { tap: createHoldTap(() => t), phases, send, advance: (ms: number) => void (t += ms) };
}

describe("hold versus tap", () => {
  it("a quick release sends down, up, toggle (fails if a tap stopped locking the tool)", () => {
    const r = rig();
    r.tap.edge("k", true, r.send);
    r.advance(TAP_MS - 1);
    r.tap.edge("k", false, r.send);
    expect(r.phases).toEqual(["down", "up", "toggle"]);
  });

  it("a slow release is a hold: no toggle (fails if the time limit were dropped)", () => {
    const r = rig();
    r.tap.edge("k", true, r.send);
    r.advance(TAP_MS);
    r.tap.edge("k", false, r.send);
    expect(r.phases).toEqual(["down", "up"]);
  });

  it("a pad pressed meanwhile makes it a hold even when quick (fails if padPressed were ignored)", () => {
    const r = rig();
    r.tap.edge("k", true, r.send);
    r.tap.padPressed();
    r.tap.edge("k", false, r.send);
    expect(r.phases).toEqual(["down", "up"]);
  });

  it("a pad pressed before the button went down does not spoil the tap", () => {
    const r = rig();
    r.tap.padPressed();
    r.tap.edge("k", true, r.send);
    r.tap.edge("k", false, r.send);
    expect(r.phases).toEqual(["down", "up", "toggle"]);
  });

  it("auto-repeat of a held button sends one down (fails if the repeat guard were removed)", () => {
    const r = rig();
    r.tap.edge("k", true, r.send);
    r.tap.edge("k", true, r.send);
    expect(r.phases).toEqual(["down"]);
  });

  it("an up with no down sends nothing", () => {
    const r = rig();
    r.tap.edge("k", false, r.send);
    expect(r.phases).toEqual([]);
  });

  it("releaseMatching gives back only matching buttons, as a hold", () => {
    const r = rig();
    const other: DeckPhase[] = [];
    r.tap.edge("a|x", true, r.send);
    r.tap.edge("b|x", true, (p) => void other.push(p));
    r.tap.releaseMatching((k) => k.startsWith("a|"));
    expect(r.phases).toEqual(["down", "up"]);
    expect(other).toEqual(["down"]);
    expect(r.tap.keys()).toEqual(["b|x"]);
  });
});
