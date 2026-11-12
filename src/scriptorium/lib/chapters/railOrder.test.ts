import { describe, expect, it } from "vitest";
import { dropSlot, moveBy, moveToSlot, neighbourAfterDelete, pagesLine } from "./railOrder";

describe("moveToSlot", () => {
  it("moves a chapter down past its neighbours, counting the slot in the original list", () => {
    expect(moveToSlot(["a", "b", "c", "d"], "a", 3)).toEqual(["b", "c", "a", "d"]);
  });
  it("moves a chapter up", () => {
    expect(moveToSlot(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("returns the same array when dropped where it already is (no write for a no-op drag)", () => {
    const ids = ["a", "b", "c"];
    expect(moveToSlot(ids, "b", 1)).toBe(ids);
    expect(moveToSlot(ids, "b", 2)).toBe(ids);
  });
});

describe("moveBy", () => {
  it("does nothing at the ends, so Move up on the first chapter cannot wrap", () => {
    const ids = ["a", "b"];
    expect(moveBy(ids, "a", -1)).toBe(ids);
    expect(moveBy(ids, "b", 1)).toBe(ids);
    expect(moveBy(ids, "a", 1)).toEqual(["b", "a"]);
  });
});

describe("neighbourAfterDelete", () => {
  it("picks the next chapter, the previous one when the last is deleted, and none for the only one", () => {
    expect(neighbourAfterDelete(["a", "b", "c"], "b")).toBe("c");
    expect(neighbourAfterDelete(["a", "b", "c"], "c")).toBe("b");
    expect(neighbourAfterDelete(["a"], "a")).toBeNull();
  });
});

describe("dropSlot", () => {
  it("counts the rows whose midpoint the pointer has passed", () => {
    expect(dropSlot([10, 30, 50], 5)).toBe(0);
    expect(dropSlot([10, 30, 50], 35)).toBe(2);
    expect(dropSlot([10, 30, 50], 99)).toBe(3);
  });
});

describe("pagesLine", () => {
  it("omits the line while the layout is unknown and names one page in the singular", () => {
    expect(pagesLine(undefined)).toBeNull();
    expect(pagesLine({ first: null, last: null })).toBeNull();
    expect(pagesLine({ first: "12", last: "12" })).toBe("Page 12");
    expect(pagesLine({ first: "175", last: "191" })).toBe("Pages 175 to 191");
  });
});
