import { describe, expect, it } from "vitest";
import { buildHandoutPin, describeBoard, pinStyleForTheme } from "./handoutPin";
import { findFreeSpot } from "@/lib/noticeBoard/geometry";

const board = { id: "b1", campaign_id: "c1" };

describe("pinStyleForTheme", () => {
  it("hangs a handout as the paper it is written on", () => {
    expect(pinStyleForTheme("letter")).toBe("letter");
    expect(pinStyleForTheme("notice")).toBe("poster");
    expect(pinStyleForTheme("journal")).toBe("note");
    expect(pinStyleForTheme("plain")).toBe("note");
  });

  it("hangs a book look as a note, never a letter or poster", () => {
    expect(pinStyleForTheme("onednd2024")).toBe("note");
    expect(pinStyleForTheme("phb2014")).toBe("note");
  });
});

describe("buildHandoutPin", () => {
  it("offers this handout, up at once, under the front line the DM wrote", () => {
    const pin = buildHandoutPin({ handoutId: "h1", theme: "letter", board, boardPins: [], headline: "  To whoever keeps the hours " });
    expect(pin).toMatchObject({
      campaign_id: "c1",
      board_id: "b1",
      handout_id: "h1",
      headline: "To whoever keeps the hours",
      status: "up",
      style: "letter",
      seal: "red",
    });
  });

  it("seals only a letter", () => {
    expect(buildHandoutPin({ handoutId: "h", theme: "notice", board, boardPins: [], headline: "x" }).seal).toBeNull();
  });

  it("goes after every pin already on the board, drafts included, so reading order stays the DM's", () => {
    const pins = [
      { style: "note", size: "md", x: 0.1, y: 0.1, status: "up", sort_order: 4 },
      { style: "note", size: "md", x: 0.5, y: 0.5, status: "draft", sort_order: 9 },
    ] as const;
    expect(buildHandoutPin({ handoutId: "h", theme: "plain", board, boardPins: pins, headline: "x" }).sort_order).toBe(10);
  });

  it("lands at the emptiest free spot among the hung pins, ignoring a draft that is not on the board", () => {
    const up = { style: "note", size: "md", x: 0.3, y: 0.3, status: "up", sort_order: 1 } as const;
    const draft = { style: "note", size: "md", x: 0.6, y: 0.6, status: "draft", sort_order: 2 } as const;
    const pin = buildHandoutPin({ handoutId: "h", theme: "plain", board, boardPins: [up, draft], headline: "x" });
    const expected = findFreeSpot([up], "note", "md");
    expect([pin.x, pin.y]).toEqual([expected.x, expected.y]);
  });
});

describe("describeBoard", () => {
  it("says where it hangs and whether players can see it", () => {
    expect(describeBoard({ is_revealed: true }, ["the inn"])).toBe("Hangs at the inn · shown to players");
    expect(describeBoard({ is_revealed: false }, [])).toBe("Not hung anywhere yet · hidden");
  });
});
