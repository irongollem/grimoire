import { describe, expect, it } from "vitest";
import { parseAskBody } from "./askBody.ts";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const REC = "00000000-0000-4000-8000-0000000000f1";

describe("parseAskBody", () => {
  it("takes a plain question and trims it", () => {
    expect(parseAskBody({ campaignId: CAMPAIGN, message: "  who runs the mill?  " })).toEqual({ ok: true, body: { campaignId: CAMPAIGN, message: "who runs the mill?" } });
  });

  it("refuses a body that cannot be read as one: no campaign id, a bad session id, an empty or oversize message", () => {
    expect(parseAskBody(null).ok).toBe(false);
    expect(parseAskBody({ message: "x" }).ok).toBe(false);
    expect(parseAskBody({ campaignId: "nope", message: "x" }).ok).toBe(false);
    expect(parseAskBody({ campaignId: CAMPAIGN, sessionId: "nope", message: "x" }).ok).toBe(false);
    expect(parseAskBody({ campaignId: CAMPAIGN, message: "   " }).ok).toBe(false);
    expect(parseAskBody({ campaignId: CAMPAIGN, message: "x".repeat(4001) }).ok).toBe(false);
  });

  it("keeps the route and a context record of a known kind with a uuid", () => {
    const parsed = parseAskBody({ campaignId: CAMPAIGN, message: "x", context: { route: "/npcs/1", record: { type: "npc", id: REC } } });
    expect(parsed).toMatchObject({ ok: true, body: { context: { route: "/npcs/1", record: { type: "npc", id: REC } } } });
  });

  it("drops a context record of an unknown kind or a non-uuid id, and keeps the route", () => {
    const unknownKind = parseAskBody({ campaignId: CAMPAIGN, message: "x", context: { route: "/x", record: { type: "player_journal", id: REC } } });
    expect(unknownKind).toMatchObject({ ok: true, body: { context: { route: "/x" } } });
    expect((unknownKind as { body: { context: object } }).body.context).not.toHaveProperty("record");
    const badId = parseAskBody({ campaignId: CAMPAIGN, message: "x", context: { route: "/x", record: { type: "npc", id: "1 or 1=1" } } });
    expect((badId as { body: { context: object } }).body.context).not.toHaveProperty("record");
  });

  it("refuses a context that is not an object with a route", () => {
    expect(parseAskBody({ campaignId: CAMPAIGN, message: "x", context: "here" }).ok).toBe(false);
    expect(parseAskBody({ campaignId: CAMPAIGN, message: "x", context: { record: { type: "npc", id: REC } } }).ok).toBe(false);
  });
});
