import { describe, expect, it } from "vitest";
import {
  diceRulesFor,
  parseRollRequest,
  performServerRoll,
  rollMessageRow,
  rollOnServer,
  secureDie,
  type RollMessageRow,
  type ServerRollDeps,
} from "./serverRoll.ts";
import { plainDiceRules } from "../../../src/lib/dice/plainDiceRules.ts";
import type { RollResult } from "../../../src/lib/dice/dice.ts";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const DM = "22222222-2222-4222-8222-222222222222";
const PLAYER = "33333333-3333-4333-8333-333333333333";
const rules5e = diceRulesFor("dnd5e-2024");

const req = (over: Record<string, unknown> = {}) => ({ campaignId: CAMPAIGN, expression: "2d6+3", ...over });

describe("parseRollRequest", () => {
  it("refuses an expression that does not parse, which would otherwise roll nothing", () => {
    expect(() => parseRollRequest(req({ expression: "banana" }), rules5e)).toThrow(/not a dice expression/);
  });

  it("refuses a flat number, which has no die to roll", () => {
    expect(() => parseRollRequest(req({ expression: "15" }), rules5e)).toThrow(/at least one die/);
  });

  it("accepts 100 dice and refuses 101, so the cap sits on the right side of the line", () => {
    expect(parseRollRequest(req({ expression: "100d6" }), rules5e).counts[6]).toBe(100);
    expect(() => parseRollRequest(req({ expression: "101d6" }), rules5e)).toThrow(/at most 100 dice/);
  });

  it("counts dice across terms, so 60d6+60d8 cannot slip under a per-term cap", () => {
    expect(() => parseRollRequest(req({ expression: "60d6+60d8" }), rules5e)).toThrow(/at most 100 dice/);
  });

  it("refuses a die size the app does not roll, which parsedToCounts would silently drop", () => {
    expect(() => parseRollRequest(req({ expression: "2d7" }), rules5e)).toThrow(/d7 is not a die/);
  });

  it("holds the modifier to -1000..1000", () => {
    expect(parseRollRequest(req({ expression: "1d20+1000" }), rules5e).modifier).toBe(1000);
    expect(() => parseRollRequest(req({ expression: "1d20+1001" }), rules5e)).toThrow(/modifier/);
    expect(() => parseRollRequest(req({ expression: "1d20-1001" }), rules5e)).toThrow(/modifier/);
  });

  it("accepts an 80-character label and refuses 81", () => {
    expect(parseRollRequest(req({ label: "a".repeat(80) }), rules5e).label).toHaveLength(80);
    expect(() => parseRollRequest(req({ label: "a".repeat(81) }), rules5e)).toThrow(/80 characters/);
  });

  it("trims the label before measuring it", () => {
    expect(parseRollRequest(req({ label: `  ${"a".repeat(80)}  ` }), rules5e).label).toHaveLength(80);
  });

  it("refuses a mode the rules do not offer, and plain dice offer none", () => {
    expect(() => parseRollRequest(req({ mode: "inspired" }), rules5e)).toThrow(/offer these modes/);
    expect(() => parseRollRequest(req({ mode: "advantage" }), plainDiceRules)).toThrow(/offer these modes/);
    expect(parseRollRequest(req({ mode: "advantage" }), rules5e).mode).toBe("advantage");
    expect(parseRollRequest(req(), rules5e).mode).toBe("normal");
  });

  it("refuses a campaign id that is not a uuid", () => {
    expect(() => parseRollRequest(req({ campaignId: "x" }), rules5e)).toThrow(/campaignId/);
  });
});

describe("secureDie", () => {
  it("rejects a draw past the last whole multiple of the die, which modulo alone would fold onto the low faces", () => {
    // d6: 2^32 = 715827882 * 6 + 4, so the last 4 values (4294967292..4294967295) are biased.
    // 4294967293 is thrown away; the next draw, 7, is face 7 % 6 + 1 = 2.
    const draws = [4294967293, 7];
    expect(secureDie(6, () => draws.shift()!)).toBe(2);
    expect(draws).toHaveLength(0);
  });

  it("keeps the last whole multiple's own values", () => {
    // 4294967291 % 6 = 5, so face 6: the highest unbiased draw is kept, not rejected.
    expect(secureDie(6, () => 4294967291)).toBe(6);
  });

  it("returns faces in 1..sides from the real source", () => {
    for (let i = 0; i < 200; i++) {
      const v = secureDie(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe("rollOnServer", () => {
  it("takes its faces from the injected die", () => {
    // 2d6+3 with every die showing 4: 4 + 4 + 3 = 11.
    const request = parseRollRequest(req(), rules5e);
    const result = rollOnServer(request, { rules: rules5e, roll: () => 4 });
    expect(result.total).toBe(11);
    expect(result.breakdown.map((d) => d.val)).toEqual([4, 4]);
  });

  it("keeps the higher of two d20 faces on advantage (PHB 2014 'Advantage and Disadvantage')", () => {
    const faces = [5, 17];
    const request = parseRollRequest(req({ expression: "1d20+2", mode: "advantage" }), rules5e);
    const result = rollOnServer(request, { rules: rules5e, roll: () => faces.shift()! });
    expect(result.total).toBe(19);
    expect(result.breakdown).toEqual([{ val: 17, dropped: false }, { val: 5, dropped: true }]);
  });

  it("marks a natural 20 a critical, the 5e rule", () => {
    const request = parseRollRequest(req({ expression: "1d20" }), rules5e);
    expect(rollOnServer(request, { rules: rules5e, roll: () => 20 }).isCrit).toBe(true);
  });

  it("scores a Generic campaign with plain dice: a 20 is no critical", () => {
    const request = parseRollRequest(req({ expression: "1d20" }), plainDiceRules);
    expect(rollOnServer(request, { rules: plainDiceRules, roll: () => 20 }).isCrit).toBe(false);
  });

  it("carries the caller's label and the damage flag through", () => {
    const request = parseRollRequest(req({ label: "Goblin bite", isDamage: true }), rules5e);
    const result = rollOnServer(request, { rules: rules5e, roll: () => 1 });
    expect(result.label).toBe("Goblin bite");
    expect(result.isDamage).toBe(true);
  });

  it("falls back to the pool's own label when none is given", () => {
    const request = parseRollRequest(req(), rules5e);
    expect(rollOnServer(request, { rules: rules5e, roll: () => 1 }).label).toBe("2d6+3");
  });
});

const crit: RollResult = { total: 25, label: "1d20+5", modifier: 5, breakdown: [{ val: 20, dropped: false }], isCrit: true, isFumble: false };
const plain: RollResult = { total: 11, label: "2d6+3", modifier: 3, breakdown: [], isCrit: false, isFumble: false };

describe("rollMessageRow", () => {
  const to = { campaignId: CAMPAIGN, userId: DM, senderName: "Mira" };

  it("always carries the stamp, whoever the roll is for", () => {
    expect(rollMessageRow(plain, { ...to, recipientUserId: null }).server_rolled).toBe(true);
    expect(rollMessageRow(plain, { ...to, recipientUserId: DM }).server_rolled).toBe(true);
  });

  it("words the message as the client does", () => {
    expect(rollMessageRow(plain, { ...to, recipientUserId: null }).message).toBe("rolled 2d6+3 = 11");
  });

  it("is a dm_roll to the recipient when hidden and a public roll otherwise", () => {
    const hidden = rollMessageRow(plain, { ...to, recipientUserId: DM });
    expect([hidden.type, hidden.recipient_user_id]).toEqual(["dm_roll", DM]);
    const open = rollMessageRow(plain, { ...to, recipientUserId: null });
    expect([open.type, open.recipient_user_id]).toEqual(["roll", null]);
  });

  it("never hides a critical", () => {
    const row = rollMessageRow(crit, { ...to, recipientUserId: DM });
    expect([row.type, row.recipient_user_id]).toEqual(["roll", null]);
  });
});

function deps(over: Partial<ServerRollDeps> = {}) {
  const inserted: RollMessageRow[] = [];
  const d: ServerRollDeps = {
    loadCampaign: async (id) => ({ id, user_id: DM, game_system: "dnd5e-2024" }),
    isMember: async () => true,
    isDm: async (_c, user) => user === DM,
    speakerName: async () => "Mira",
    insertMessage: async (row) => {
      inserted.push(row);
      return "msg-1";
    },
    roll: () => 4,
    ...over,
  };
  return { d, inserted };
}

describe("performServerRoll", () => {
  it("posts a stamped row and returns its id and result", async () => {
    const { d, inserted } = deps();
    const out = await performServerRoll(req(), PLAYER, d);
    expect(out.messageId).toBe("msg-1");
    expect(out.result.total).toBe(11);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ campaign_id: CAMPAIGN, user_id: PLAYER, sender_name: "Mira", server_rolled: true, type: "roll" });
  });

  it("refuses a non-member and inserts nothing", async () => {
    const { d, inserted } = deps({ isMember: async () => false });
    await expect(performServerRoll(req(), PLAYER, d)).rejects.toThrow(/member/);
    expect(inserted).toHaveLength(0);
  });

  it("refuses a campaign the caller cannot see and inserts nothing", async () => {
    const { d, inserted } = deps({ loadCampaign: async () => null });
    await expect(performServerRoll(req(), PLAYER, d)).rejects.toThrow(/No campaign/);
    expect(inserted).toHaveLength(0);
  });

  it("refuses a player's hidden roll and inserts nothing", async () => {
    const { d, inserted } = deps();
    await expect(performServerRoll(req({ hidden: true }), PLAYER, d)).rejects.toThrow(/Only the DM/);
    expect(inserted).toHaveLength(0);
  });

  it("addresses a DM's hidden roll to the DM themself, as a dm_roll", async () => {
    const { d, inserted } = deps();
    const out = await performServerRoll(req({ hidden: true }), DM, d);
    expect(out.hidden).toBe(true);
    expect([inserted[0].type, inserted[0].recipient_user_id]).toEqual(["dm_roll", DM]);
  });

  it("makes a DM's hidden critical public and says so", async () => {
    const { d, inserted } = deps({ roll: () => 20 });
    const out = await performServerRoll(req({ expression: "1d20", hidden: true }), DM, d);
    expect(out.hidden).toBe(false);
    expect([inserted[0].type, inserted[0].recipient_user_id]).toEqual(["roll", null]);
  });

  it("inserts nothing when the request is invalid", async () => {
    const { d, inserted } = deps();
    await expect(performServerRoll(req({ expression: "101d6" }), DM, d)).rejects.toThrow(/at most 100/);
    expect(inserted).toHaveLength(0);
  });

  it("rolls a Generic campaign with plain dice, so advantage is refused there", async () => {
    const { d } = deps({ loadCampaign: async (id) => ({ id, user_id: DM, game_system: "generic" }) });
    await expect(performServerRoll(req({ expression: "1d20", mode: "advantage" }), DM, d)).rejects.toThrow(/offer these modes/);
  });
});
