import { describe, expect, it } from "vitest";
import { isClick, resolvePointerAction } from "./playPointer";
import type { PlayTool } from "./playTypes";

const base = { imageReady: true, canEdit: true, tool: "move" as PlayTool, onDoor: false, placing: false };

describe("resolvePointerAction", () => {
  // #1125 frame 10: doors toggle in ANY tool.
  it.each<PlayTool>(["move", "fog", "darkness"])("a press on a door toggles it under the %s tool", (tool) => {
    expect(resolvePointerAction({ ...base, tool, onDoor: true })).toBe("toggle-door");
  });

  it("off a door, Move pans, Fog brushes and Darkness places", () => {
    expect(resolvePointerAction({ ...base, tool: "move" })).toBe("pan");
    expect(resolvePointerAction({ ...base, tool: "fog" })).toBe("brush");
    expect(resolvePointerAction({ ...base, tool: "darkness" })).toBe("darkness");
  });

  it("an armed portrait lands on the next press, whatever tool is on", () => {
    expect(resolvePointerAction({ ...base, tool: "fog", placing: true })).toBe("place");
  });

  // A follower window has no tools: a brush stroke or a door click from the second monitor would edit the fight.
  it("a follower can only pan, even on a door or with the Fog tool left armed", () => {
    expect(resolvePointerAction({ ...base, canEdit: false, tool: "fog", onDoor: true, placing: true })).toBe("pan");
  });

  it("does nothing until the map picture has loaded", () => {
    expect(resolvePointerAction({ ...base, imageReady: false, onDoor: true })).toBe("none");
  });
});

describe("Shift on the Move tool", () => {
  // #1125 frame 11: Shift and drag a box on empty map selects the party.
  it("draws a selection box instead of panning", () => {
    expect(resolvePointerAction({ ...base, shift: true })).toBe("box-select");
  });

  it("leaves the fog brush and the darkness sphere alone, and a door still opens", () => {
    expect(resolvePointerAction({ ...base, tool: "fog", shift: true })).toBe("brush");
    expect(resolvePointerAction({ ...base, tool: "darkness", shift: true })).toBe("darkness");
    expect(resolvePointerAction({ ...base, shift: true, onDoor: true })).toBe("toggle-door");
  });

  it("is nothing to a follower", () => {
    expect(resolvePointerAction({ ...base, canEdit: false, shift: true })).toBe("pan");
  });
});

describe("a click", () => {
  it("is a press that stayed put, not a pan or a drag", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 40, y: 10 })).toBe(false);
  });
});
