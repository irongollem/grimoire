import { describe, expect, it } from "vitest";
import { TAB_ID } from "./tabId";

describe("TAB_ID", () => {
  it("is a token private.ring_campaigns accepts, or every ring from this tab would carry no origin", () => {
    expect(TAB_ID).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});
