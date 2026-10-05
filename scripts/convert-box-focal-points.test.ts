import { describe, expect, it } from "vitest";
import {
  assertMayWrite,
  boxToPicture,
  inBoxWindow,
  measureUrls,
  parseCli,
  planChanges,
  selectCandidates,
  type FocalRow,
} from "./convert-box-focal-points";

const IN_WINDOW = "2026-06-01T12:00:00Z";
const BEFORE = "2026-03-20T12:00:00Z";
const AFTER = "2026-10-04T12:00:00Z";

function row(over: Partial<FocalRow>): FocalRow {
  return {
    table: "npcs",
    focalColumn: "portrait_focal_point",
    id: "n1",
    url: "https://cdn.example/npc-portraits/u1/a.webp",
    focal: { x: 40, y: 20 },
    createdAt: IN_WINDOW,
    ...over,
  };
}

describe("boxToPicture", () => {
  it("moves y away from the middle on a picture taller than 3:4", () => {
    // 2:3 shows the middle 8/9 of the height: 10% of the box is ~14.4% of the picture.
    expect(boxToPicture({ x: 30, y: 10 }, 2 / 3)).toEqual({ x: 30, y: 14 });
    expect(boxToPicture({ x: 30, y: 90 }, 2 / 3)).toEqual({ x: 30, y: 86 });
  });

  it("moves x away from the middle on a picture wider than 3:4", () => {
    // A square shows the middle 3/4 of the width: 0% of the box is 12.5% of the picture.
    expect(boxToPicture({ x: 0, y: 70 }, 1)).toEqual({ x: 13, y: 70 });
    expect(boxToPicture({ x: 100, y: 70 }, 1)).toEqual({ x: 88, y: 70 });
  });

  it("leaves the centre, and any point on a 3:4 picture, where it is", () => {
    expect(boxToPicture({ x: 50, y: 50 }, 2 / 3)).toEqual({ x: 50, y: 50 });
    expect(boxToPicture({ x: 50, y: 50 }, 16 / 9)).toEqual({ x: 50, y: 50 });
    expect(boxToPicture({ x: 12, y: 88 }, 0.75)).toEqual({ x: 12, y: 88 });
  });
});

describe("inBoxWindow", () => {
  it("covers 28 Apr to 4 Oct 2026 only", () => {
    expect(inBoxWindow(BEFORE)).toBe(false);
    expect(inBoxWindow(IN_WINDOW)).toBe(true);
    expect(inBoxWindow(AFTER)).toBe(false);
  });
});

describe("selectCandidates", () => {
  it("takes rows created in the window and skips older and newer ones", () => {
    const { candidates } = selectCandidates([
      row({ id: "old", createdAt: BEFORE, focal: { x: 1, y: 1 } }),
      row({ id: "mid" }),
      row({ id: "new", createdAt: AFTER, focal: { x: 2, y: 2 } }),
    ]);
    expect(candidates.map((r) => r.id)).toEqual(["mid"]);
  });

  it("keeps a copy of an older row's point, across tables", () => {
    const older = row({ id: "orig", table: "monsters", focalColumn: "portrait_focal_point", createdAt: BEFORE });
    const { candidates, copies } = selectCandidates([older, row({ id: "copy" })]);
    expect(candidates).toEqual([]);
    expect(copies.map((r) => r.id)).toEqual(["copy"]);
  });

  it("does not call a row a copy when only the picture matches", () => {
    const older = row({ id: "orig", createdAt: BEFORE, focal: { x: 41, y: 20 } });
    expect(selectCandidates([older, row({ id: "mine" })]).candidates.map((r) => r.id)).toEqual(["mine"]);
  });

  it("leaves centre points and rows without a picture out of the conversion", () => {
    const { candidates, noPicture } = selectCandidates([
      row({ id: "centre", focal: { x: 50, y: 50 } }),
      row({ id: "bare", url: null }),
    ]);
    expect(candidates).toEqual([]);
    expect(noPicture.map((r) => r.id)).toEqual(["bare"]);
  });
});

describe("planChanges", () => {
  it("converts by the measured shape and drops unmeasured pictures and no-ops", () => {
    const tall = row({ id: "tall", url: "t", focal: { x: 40, y: 10 } });
    const unknown = row({ id: "unknown", url: "u" });
    const noop = row({ id: "noop", url: "s", focal: { x: 40, y: 50 } });
    const changes = planChanges(
      [tall, unknown, noop],
      new Map([
        ["t", 2 / 3],
        ["u", null],
        ["s", 2 / 3],
      ]),
    );
    expect(changes).toEqual([
      { table: "npcs", focalColumn: "portrait_focal_point", id: "tall", url: "t", aspect: 2 / 3, old: { x: 40, y: 10 }, new: { x: 40, y: 14 } },
    ]);
  });
});

describe("measureUrls", () => {
  it("tries the 400px variant of a WebP first, without the query string", () => {
    expect(measureUrls("https://cdn.example/b/u1/a.webp?v=2")).toEqual([
      "https://cdn.example/b/u1/a_w400.webp",
      "https://cdn.example/b/u1/a.webp",
    ]);
    expect(measureUrls("https://x.supabase.co/storage/v1/object/public/b/u1/a.png")).toEqual([
      "https://x.supabase.co/storage/v1/object/public/b/u1/a.png",
    ]);
  });
});

describe("cli", () => {
  it("is a dry run unless told to write", () => {
    expect(parseCli([])).toEqual({ write: false, yesProduction: false, out: null, restore: null });
    expect(parseCli(["--restore", "a.json", "--write"])).toMatchObject({ restore: "a.json", write: true });
  });

  it("refuses a production write without --yes-production", () => {
    const prod = "https://abc.supabase.co";
    expect(() => assertMayWrite({ write: true, yesProduction: false, restore: "a.json" }, prod)).toThrow(/yes-production/);
    expect(() => assertMayWrite({ write: true, yesProduction: true, restore: "a.json" }, prod)).not.toThrow();
    expect(() => assertMayWrite({ write: false, yesProduction: false, restore: null }, prod)).not.toThrow();
  });

  it("refuses to convert production a second time, but converts a local stack", () => {
    expect(() => assertMayWrite({ write: true, yesProduction: true, restore: null }, "https://abc.supabase.co")).toThrow(/convert again/);
    expect(() => assertMayWrite({ write: true, yesProduction: false, restore: null }, "http://127.0.0.1:54321")).not.toThrow();
  });
});
