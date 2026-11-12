import { describe, expect, it } from "vitest";
import { refusalFor } from "./refusalFor";

describe("refusalFor", () => {
  it("lets a DM of an AI campaign through", () => {
    expect(refusalFor({ isDm: true, aiEnabled: true })).toBeNull();
  });

  // Bug: a player, a campaign member, could spend the DM's credits.
  it("refuses a non-DM, even with AI on", () => {
    expect(refusalFor({ isDm: false, aiEnabled: true })).toEqual({ error: "forbidden", status: 403 });
  });

  // Bug: a campaign with AI off could still reach the paid function directly.
  it("refuses with ai_disabled when the campaign has AI off", () => {
    expect(refusalFor({ isDm: true, aiEnabled: false })).toEqual({ error: "ai_disabled", status: 403 });
  });

  // Bug: the AI setting was reported to someone who is not the DM.
  it("answers a non-DM with forbidden before it mentions the AI setting", () => {
    expect(refusalFor({ isDm: false, aiEnabled: false })).toEqual({ error: "forbidden", status: 403 });
  });
});
