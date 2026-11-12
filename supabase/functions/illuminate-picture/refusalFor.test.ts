import { describe, expect, it } from "vitest";
import { refusalFor } from "./refusalFor";

const ok = { isDm: true, aiEnabled: true, likenessAcknowledged: true, action: "cutout" as const };

describe("refusalFor", () => {
  it("lets a DM of an AI campaign through", () => {
    expect(refusalFor(ok)).toBeNull();
  });

  // Bug: a player, a campaign member, could spend the DM's credits.
  it("refuses a non-DM, even with AI on", () => {
    expect(refusalFor({ ...ok, isDm: false })).toEqual({ error: "forbidden", status: 403 });
  });

  // Bug: a campaign with AI off could still reach the paid function directly.
  it("refuses with ai_disabled when the campaign has AI off", () => {
    expect(refusalFor({ ...ok, aiEnabled: false })).toEqual({ error: "ai_disabled", status: 403 });
  });

  // Bug: a restyle of a possibly real person ran without the likeness acknowledgement.
  it.each(["ink", "watercolour", "match"] as const)("refuses %s without the likeness acknowledgement", (action) => {
    expect(refusalFor({ ...ok, action, likenessAcknowledged: false })).toEqual({ error: "likeness_acknowledgement_required", status: 403 });
    expect(refusalFor({ ...ok, action })).toBeNull();
  });

  // Bug: the gate over-reached and blocked actions that change no likeness.
  it.each(["cutout", "extend"] as const)("does not ask for it on %s", (action) => {
    expect(refusalFor({ ...ok, action, likenessAcknowledged: false })).toBeNull();
  });
});
