import { describe, expect, it } from "vitest";
import type { DollSheets } from "@edge-shared/paperDoll/types.ts";
import { DOLL_TEMPLATE_LAYOUTS } from "@/data/dollTemplates";
import { burdenPicture, outfitPicture, pickDollArt, pictureStyles, shiftTransform, type DollArt } from "./dollStack";

const SHIFT = { dx: 14, dy: -20 };

function stored(tag: string): DollSheets {
  const shift = (dx: number) => ({ dx, dy: 0 });
  return {
    version: 1,
    sheets: { garb: `${tag}-garb`, armour: `${tag}-armour`, burden: `${tag}-burden` },
    layout: {
      anatomy: { head: { x0: 0, y0: 0, x1: 1, y1: 1 }, shoulders: { x0: 0, x1: 1, y: 1 }, feetY: 900, centerX: 256 },
      figureShift: {
        underclothes: shift(0),
        clothes: SHIFT,
        robes: shift(5),
        armour_light: shift(6),
        armour_medium: shift(7),
        armour_heavy: shift(8),
      },
      cuts: { garb: [500, 1030], armour: [512, 1024], burden: [530, 1000] },
    },
    model: "m",
    generatedAt: "2026-10-06T00:00:00Z",
  };
}

describe("pickDollArt", () => {
  it("prefers the character, then the species, then the template", () => {
    expect(pickDollArt(stored("c"), stored("s"), "medium").source).toBe("character");
    expect(pickDollArt(stored("c"), stored("s"), "medium").sheets.garb).toBe("c-garb");
    expect(pickDollArt(null, stored("s"), "medium").sheets.garb).toBe("s-garb");
    const t = pickDollArt(null, null, "small");
    expect(t.source).toBe("template");
    expect(t.layout).toBe(DOLL_TEMPLATE_LAYOUTS.small);
    expect(Object.keys(t.sheets).sort()).toEqual(["armour", "burden", "garb"]);
  });

  it("treats a malformed doll as absent, and never mixes sources", () => {
    const broken = { ...stored("c"), sheets: { garb: "x" } };
    const art = pickDollArt(broken, stored("s"), "medium");
    expect(art.source).toBe("species");
    expect(Object.values(art.sheets).every((u) => u.startsWith("s-"))).toBe(true);
  });

  it("treats a doll without cuts as malformed", () => {
    const { cuts: _cuts, ...layout } = stored("c").layout;
    expect(pickDollArt({ ...stored("c"), layout }, null, "medium").source).toBe("template");
  });
});

describe("outfitPicture", () => {
  const art: DollArt = pickDollArt(stored("c"), null, "medium");

  it("points at the outfit's sheet and cell, with its shift", () => {
    expect(outfitPicture(art, "clothes")).toEqual({
      url: "c-garb",
      cell: 1,
      clip: { x0: -12, x1: 518 },
      shift: SHIFT,
    });
    const heavy = outfitPicture(art, "armour_heavy");
    expect(heavy.url).toBe("c-armour");
    expect(heavy.cell).toBe(2);
    expect(heavy.shift).toEqual({ dx: 8, dy: 0 });
  });

  it("clips cell 0 at the left cut, which can fall left of the cell edge", () => {
    expect(outfitPicture(art, "underclothes").clip).toEqual({ x0: 0, x1: 500 });
  });

  it("clips cell 2 from the right cut to the sheet's end", () => {
    expect(outfitPicture(art, "robes").clip).toEqual({ x0: 1030 - 1024, x1: 512 });
  });

  it("lets cell 1 reach into its neighbours when the cuts lie outside the cell", () => {
    const wide = outfitPicture(art, "armour_medium");
    expect(wide.clip).toEqual({ x0: 0, x1: 512 });
    const burdenArt: DollArt = { ...art, layout: { ...art.layout, cuts: { ...art.layout.cuts, armour: [470, 1060] } } };
    expect(outfitPicture(burdenArt, "armour_medium").clip).toEqual({ x0: -42, x1: 548 });
  });
});

describe("burdenPicture", () => {
  const art: DollArt = pickDollArt(stored("c"), null, "medium");

  it("is the outfit picture when unencumbered", () => {
    expect(burdenPicture(art, "clothes", "unencumbered")).toEqual(outfitPicture(art, "clothes"));
  });

  it("is a burden cell, never shifted, otherwise", () => {
    expect(burdenPicture(art, "clothes", "heavily_encumbered")).toEqual({
      url: "c-burden",
      cell: 1,
      clip: { x0: 530 - 512, x1: 1000 - 512 },
      shift: { dx: 0, dy: 0 },
    });
    expect(burdenPicture(art, "armour_heavy", "encumbered").cell).toBe(0);
    expect(burdenPicture(art, "armour_heavy", "over_encumbered").cell).toBe(2);
  });
});

describe("pictureStyles", () => {
  const pct = (s: string) => parseFloat(s);

  it("shows the whole cell for a plain 0..512 clip", () => {
    const { window, image } = pictureStyles({ url: "u", cell: 1, clip: { x0: 0, x1: 512 }, shift: { dx: 0, dy: 0 } });
    expect(pct(window.left)).toBeCloseTo(0);
    expect(pct(window.width)).toBeCloseTo(100);
    expect(pct(image.width)).toBeCloseTo(300);
    expect(pct(image.left)).toBeCloseTo(-100);
  });

  it("widens the window past the cell and offsets the sheet inside it", () => {
    const { window, image } = pictureStyles({ url: "u", cell: 1, clip: { x0: -12, x1: 518 }, shift: { dx: 0, dy: 0 } });
    expect(pct(window.left)).toBeCloseTo((-12 / 512) * 100);
    expect(pct(window.width)).toBeCloseTo((530 / 512) * 100);
    expect(pct(image.width)).toBeCloseTo((1536 / 530) * 100);
    expect(pct(image.left)).toBeCloseTo((-500 / 530) * 100);
  });
});

describe("shiftTransform", () => {
  it("expresses a cell-pixel shift as a percentage translate", () => {
    expect(shiftTransform({ dx: 0, dy: 0 })).toBe("translate(0%, 0%)");
    expect(shiftTransform({ dx: 14, dy: -20 })).toBe("translate(2.734375%, -1.953125%)");
  });
});
