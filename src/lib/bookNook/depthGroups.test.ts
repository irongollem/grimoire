import { describe, expect, it } from "vitest";
import { standingGroup } from "./depthGroups.ts";
import { addCutout, newScene, setDepth, setHold } from "./edit.ts";

const aspects = new Map<string, number>([["plate", 0.5625], ["hill", 0.5], ["lamb", 1], ["picnic", 1], ["bird", 1]]);
const cut = (id: string, w = 400) => ({ id, src: id, width: w, height: w });
function nook() {
  let s = newScene({ id: "n", title: "N", room: { url: "r", width: 2400, height: 1350 } });
  s = addCutout(s, cut("hill", 1200), { x: 1200, y: 1000 }); // stands: rect 600..1800 x 400..1000
  s = addCutout(s, cut("lamb", 200), { x: 1000, y: 800 }); // feet inside the hill
  s = addCutout(s, cut("picnic", 200), { x: 1400, y: 900 }); // feet inside the hill
  s = addCutout(s, cut("bird", 200), { x: 1000, y: 700 });
  return setHold(s, "bird", "floats", 1);
}

describe("standingGroup", () => {
  it("brings along what stands on it, and not what floats", () => {
    // Bug: dragging the hill nearer leaves the lamb and the picnic behind at the old depth, hovering.
    expect(standingGroup(nook(), "hill", aspects).sort()).toEqual(["hill", "lamb", "picnic"]);
  });
  it("leaves a stander alone when it is the one dragged", () => {
    expect(standingGroup(nook(), "lamb", aspects)).toEqual(["lamb"]);
  });
  it("ignores a thing at another depth, which does not stand on it", () => {
    // Bug: a Near thing drawn over the hill dragged with it.
    const s = setDepth(nook(), { kind: "layer", id: "lamb" }, 1.4);
    expect(standingGroup(s, "hill", aspects).sort()).toEqual(["hill", "picnic"]);
  });
  it("follows a stack of things standing on things", () => {
    let s = nook();
    s = addCutout(s, cut("cup", 50), { x: 1000, y: 700 }); // inside the lamb's rect: 900..1100 x 600..800
    const withCup = new Map(aspects).set("cup", 1);
    expect(standingGroup(s, "hill", withCup)).toContain("cup");
  });
  it("refuses an unknown layer", () => {
    expect(() => standingGroup(nook(), "ghost", aspects)).toThrow(/no layer/);
  });
});
