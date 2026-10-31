import { describe, expect, it } from "vitest";
import { objectArmorClass, objectHitPoints } from "./objects";

describe("objects", () => {
  // DMG 2014 / 2024 "Objects": Object Armor Class "Wood, bone 15", "Adamantine 23".
  it("gives a wooden door AC 15 and adamantine the top of the table", () => {
    expect(objectArmorClass("wood")).toBe(15);
    expect(objectArmorClass("adamantine")).toBe(23);
  });

  // DMG "Objects", Object Hit Points: "Large (cart, 10-ft.-by-10-ft. window) 5 (1d10) fragile, 27 (5d10) resilient".
  it("keeps fragile and resilient apart: a sturdy cart has 27 hit points, a window 5", () => {
    expect(objectHitPoints("large", "resilient")).toBe(27);
    expect(objectHitPoints("large", "fragile")).toBe(5);
  });
});
