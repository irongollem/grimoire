import { describe, expect, it } from "vitest";
import { craftingTimeText } from "./craftingTime";

describe("craftingTimeText", () => {
  it("agrees the unit with the number", () => {
    expect(craftingTimeText(1, "days")).toBe("1 day");
    expect(craftingTimeText(2, "days")).toBe("2 days");
    expect(craftingTimeText(1, "hours")).toBe("1 hour");
    expect(craftingTimeText(30, "minutes")).toBe("30 minutes");
    expect(craftingTimeText(1, "minutes")).toBe("1 minute");
    expect(craftingTimeText(0, "hours")).toBe("0 hours");
  });
});
