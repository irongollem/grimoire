import { describe, expect, it } from "vitest";
import { WORKBENCH_DISHES, WORKBENCH_SPRITES } from "@/data/workbenchArt";
import { dishContactDropPct, slotGeometry } from "./slotGeometry";

const dish = WORKBENCH_DISHES["rc-iron-dish"];
const sprite = WORKBENCH_SPRITES["mat-ingot-iron"];
const floorPct = (dish.opening.cy + dish.opening.ry * dish.opening.floor) * 100;

describe("slotGeometry", () => {
  it("puts the sprite's base exactly on the floor line", () => {
    const g = slotGeometry(dish, sprite);
    const base = g.sprite.top + sprite.base * g.sprite.height;
    expect(base).toBeCloseTo(floorPct, 1);
  });

  it("nudges the contact line down by 3% of the sprite's width, as a share of its own height", () => {
    const g = slotGeometry(dish, sprite);
    const sh = (0.44 * 100 * sprite.height) / sprite.width;
    expect(g.contact.dropPct).toBeCloseTo(((0.03 * 44) / sh) * 100, 2);
    expect(g.contact.opacity).toBe(0.85);
  });

  it("centres the sprite horizontally on the opening", () => {
    const g = slotGeometry(dish, sprite);
    expect(g.sprite.left + g.sprite.width / 2).toBeCloseTo(dish.opening.cx * 100, 2);
  });

  it("scale changes the width proportionally", () => {
    const a = slotGeometry(dish, sprite, 0.3);
    const b = slotGeometry(dish, sprite, 0.6);
    expect(b.sprite.width).toBeCloseTo(a.sprite.width * 2, 2);
  });

  it("reports the dish aspect", () => {
    expect(slotGeometry(dish, sprite).aspect).toBeCloseTo(dish.height / dish.width, 3);
  });

  it("masks the iron dish's front lip", () => {
    expect(slotGeometry(dish, sprite).rimMask).toBe(
      "radial-gradient(ellipse 46% 36% at 50% 43%, transparent 98%, #000 100%), linear-gradient(to bottom, transparent 43%, #000 43%)",
    );
  });
});

describe("dishContactDropPct", () => {
  it("drops the dish by 3% of its width, as a share of its own height", () => {
    expect(dishContactDropPct(dish)).toBeCloseTo(((0.03 * 512) / 356) * 100, 2);
  });
});
