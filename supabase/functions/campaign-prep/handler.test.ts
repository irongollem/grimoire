import { describe, expect, it } from "vitest";
import type { AgentUsage, CallModel } from "../_shared/agent/types";
import { FEATURE_TYPES, rollTableEntries, type Proposal } from "../_shared/campaignPrep";
import { DUNGEON_FEATURE_TYPES } from "../../../src/types/dungeonFeature.types";
import { PREP_MESSAGES, prepCampaign, type PrepDeps } from "./handler";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const DM = "dm";
const usage: AgentUsage = { provider: "openai", model: "m1", inputTokens: 3000, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 };

const QUICKSAND = { kind: "hazard", name: "Quicksand", why: "The marsh crossing in The Sunken Road.", description: "A patch of wet sand hides a sucking bog.", save: "STR", dc: 12 };
const FERRY = { kind: "place", name: "The Old Ferry", why: "The beat At the river has no place.", description: "A rope ferry with a bell.", place_type: "building", inside: "Sugarwell" };
const KEY = { kind: "item", name: "Brass Winding Key", why: "The Locked Workshop turns on it.", description: "A heavy brass key.", item_type: "gear", rarity: "mundane" };

function harness() {
  const h = {
    aiEnabled: true as boolean | null,
    answer: [QUICKSAND, FERRY, KEY] as unknown[] | null,
    existing: { hazard: new Set<string>(), place: new Set<string>(["sugarwell"]), item: new Set<string>(), roll_table: new Set<string>(), feature: new Set<string>(), milestone: new Set<string>() },
    canPay: true,
    makeThrowsFor: null as string | null,
    calls: 0,
    made: [] as Proposal[],
    charged: [] as number[],
    released: [] as string[][],
    deps: undefined as unknown as PrepDeps,
  };
  const callModel: CallModel = async () => {
    h.calls += 1;
    // As the model writes it: some thinking aloud, then the one JSON object.
    return { blocks: [{ type: "text", text: h.answer === null ? "I would rather not." : `The marsh needs a hazard.\n${JSON.stringify({ proposals: h.answer })}` }], stop: "end", usage };
  };
  h.deps = {
    loadCampaign: async () => ({ id: CAMPAIGN, user_id: DM, name: "Sugarwell", ai_enabled: h.aiEnabled }),
    isDm: async (_c, userId) => userId === DM,
    loadDigest: async () => ({ campaign: "Sugarwell", quests: [], places: [], hazards: [], items: [], tables: [], features: [], levelling: { mode: "milestone", partyLevel: null, milestones: [] } }),
    loadExisting: async () => h.existing,
    resolveProvider: async () => ({ provider: "openai", model: "m1", isByok: false, callModel }),
    loadPrice: async () => ({ inputPerMillion: 1, outputPerMillion: 4, cachedInputPerMillion: null }),
    loadCalibration: async () => ({ usdPerCredit: 0.0066, margin: 2 }),
    reserve: async () => (h.canPay ? { ok: true, ids: ["r1"] } : { ok: false, status: 402, error: "insufficient_credits" }),
    release: async (ids) => {
      h.released.push(ids);
    },
    charge: async (_u, _b, credits) => {
      h.charged.push(credits);
    },
    make: async (_ctx, proposal) => {
      if (h.makeThrowsFor === proposal.name) throw new Error("Your plan's limit on places is reached.");
      h.made.push(proposal);
    },
  };
  return h;
}

const ask = (h: ReturnType<typeof harness>, body: Record<string, unknown>, userId: string = DM) => prepCampaign({ userId, body: { campaignId: CAMPAIGN, ...body }, deps: h.deps });

describe("proposing", () => {
  // The maintainer's rule for bulk making: the DM sees the whole list first. Bug caught: proposing already making
  // the records, so the campaign fills with things nobody chose.
  it("answers the list, charges the one call, and makes nothing", async () => {
    const h = harness();
    const out = await ask(h, { action: "propose" });
    expect(out).toMatchObject({ ok: true, kind: "proposed", credits: 2 });
    if (out.ok && out.kind === "proposed") expect(out.proposals.map((p) => p.name)).toEqual(["Quicksand", "The Old Ferry", "Brass Winding Key"]);
    expect(h.made).toEqual([]);
    expect(h.charged).toEqual([2]);
    expect(h.released).toEqual([["r1"]]);
  });

  // "Nothing that matches something already there is proposed twice." Bug caught: a second Quicksand beside the
  // library's, or the same proposal listed twice.
  it("leaves out what the campaign or the library already has, and what is listed twice", async () => {
    const h = harness();
    h.existing = { ...h.existing, hazard: new Set(["quicksand"]) };
    h.answer = [QUICKSAND, KEY, { ...KEY, why: "Again." }];
    const out = await ask(h, { action: "propose" });
    if (!out.ok || out.kind !== "proposed") throw new Error("not proposed");
    expect(out.proposals.map((p) => p.name)).toEqual(["Brass Winding Key"]);
  });

  // Bug caught: a proposal the tables cannot hold (a place of no kind, a hazard with a DC nobody can roll) shown
  // to the DM, who ticks it and is then told it failed.
  it("shows only what can really be made", async () => {
    const h = harness();
    h.answer = [{ ...FERRY, place_type: "floating castle" }, { ...QUICKSAND, dc: 80 }, { ...KEY, rarity: "priceless" }, KEY];
    const out = await ask(h, { action: "propose" });
    if (!out.ok || out.kind !== "proposed") throw new Error("not proposed");
    expect(out.proposals.map((p) => p.name)).toEqual(["Brass Winding Key"]);
  });

  // "We charge every successful AI call." Bug caught: a reply with no list charged, or anyone but the DM spending.
  it("charges nothing when the model gives no list, and is the Dungeon Master's alone", async () => {
    const silent = harness();
    silent.answer = null;
    expect(await ask(silent, { action: "propose" })).toEqual({ ok: false, status: 502, error: PREP_MESSAGES.noAnswer });
    expect(silent.charged).toEqual([]);
    expect(silent.released).toEqual([["r1"]]);
    const stranger = harness();
    expect(await ask(stranger, { action: "propose" }, "player")).toEqual({ ok: false, status: 404, error: PREP_MESSAGES.notFound });
    const off = harness();
    off.aiEnabled = false;
    expect(await ask(off, { action: "propose" })).toEqual({ ok: false, status: 403, error: PREP_MESSAGES.aiOff });
    off.aiEnabled = null; // undecided is off too, as the page has it
    expect(await ask(off, { action: "propose" })).toEqual({ ok: false, status: 403, error: PREP_MESSAGES.aiOff });
    expect(stranger.calls + off.calls).toBe(0);
  });
});

describe("a roll table for a road or a region", () => {
  const ROAD = {
    kind: "roll_table", name: "On the Mill Road", why: "The Sunken Road is travelled by it.", description: "What a day on the Mill Road brings.", dice: "1d6",
    entries: [{ label: "A quiet stretch" }, { label: "A carter with a broken wheel", notes: "He will pay for help." }, { label: "Rain" }, { label: "Sugar thieves" }],
  };

  // Bug caught: a table proposed with more entries than its die has faces (some could never be rolled), or with a
  // die the app has no roller for, shown to the DM and then refused when made.
  it("is proposed only when every entry can be rolled on a die the app has", async () => {
    const h = harness();
    h.answer = [ROAD, { ...ROAD, name: "Too many", dice: "1d4", entries: Array.from({ length: 6 }, (_, i) => ({ label: `Entry ${i}` })) }, { ...ROAD, name: "Odd die", dice: "1d7" }];
    const out = await ask(h, { action: "propose" });
    if (!out.ok || out.kind !== "proposed") throw new Error("not proposed");
    expect(out.proposals.map((p) => p.name)).toEqual(["On the Mill Road"]);
  });

  // 6 faces over 4 entries: two entries take two faces each, first, and two take one. Bug caught: faces left with
  // no entry (a roll of 6 finds nothing), or two entries claiming the same face.
  it("shares the die's faces out so every roll finds exactly one entry", () => {
    let n = 0;
    const rows = rollTableEntries("1d6", [{ label: "a", notes: null }, { label: "b", notes: null }, { label: "c", notes: null }, { label: "d", notes: null }], () => `id${++n}`);
    expect(rows.map((r) => [r.min, r.max])).toEqual([[1, 2], [3, 4], [5, 5], [6, 6]]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
  });
});

describe("a dungeon feature", () => {
  const DOOR = { kind: "feature", name: "The Workshop's Back Panel", why: "The Locked Workshop is entered by it.", description: "A panel that swings in when the lamp bracket is turned.", feature_type: "Secret Door", find_dc: 14 };

  // Bug caught: a feature of a kind Dungeon Craft does not keep, or with a DC nobody could roll, shown to the DM
  // and then refused when made; and the page's kinds drifting from the app's own list.
  it("is proposed only as a kind Dungeon Craft keeps, with a DC a table can roll", async () => {
    expect([...FEATURE_TYPES].sort()).toEqual([...DUNGEON_FEATURE_TYPES].sort());
    const h = harness();
    h.answer = [DOOR, { ...DOOR, name: "Odd", feature_type: "Trapdoor to the Moon" }, { ...DOOR, name: "Unfindable", find_dc: 60 }];
    const out = await ask(h, { action: "propose" });
    if (!out.ok || out.kind !== "proposed") throw new Error("not proposed");
    expect(out.proposals).toEqual([DOOR]);
  });
});

describe("creating what was kept", () => {
  // Bug caught: only what the DM kept is made; and a model is called again (a second charge) to make it.
  it("makes exactly the proposals sent back, with no model call and no charge", async () => {
    const h = harness();
    const out = await ask(h, { action: "create", proposals: [QUICKSAND, KEY] });
    expect(out).toEqual({ ok: true, kind: "created", made: ["Quicksand", "Brass Winding Key"], skipped: [] });
    expect(h.made.map((p) => p.kind)).toEqual(["hazard", "item"]);
    expect(h.calls).toBe(0);
    expect(h.charged).toEqual([]);
  });

  // The page is not trusted with the list. Bug caught: a forged proposal made as sent (a hazard with a DC of 99,
  // a kind that is none), or something that came to exist since the list was proposed made a second time.
  it("checks the list again as if a stranger wrote it, and makes nothing that exists by now", async () => {
    const h = harness();
    h.existing = { ...h.existing, item: new Set(["brass winding key"]) };
    const out = await ask(h, { action: "create", proposals: [{ ...QUICKSAND, dc: 99 }, KEY, { kind: "npc", name: "A Spy", why: "x", description: "y" }, FERRY] });
    if (!out.ok || out.kind !== "created") throw new Error("not created");
    expect(out.made).toEqual(["The Old Ferry"]);
    expect(out.skipped).toEqual([{ name: "3 of the list", reason: "Already in the campaign by now, or not something that can be made." }]);
  });

  // Bug caught: one record that cannot be made (a plan's limit) costing the rest of the list, or failing silently.
  it("makes the rest when one cannot be made, and says which and why", async () => {
    const h = harness();
    h.makeThrowsFor = "The Old Ferry";
    const out = await ask(h, { action: "create", proposals: [FERRY, KEY] });
    expect(out).toEqual({ ok: true, kind: "created", made: ["Brass Winding Key"], skipped: [{ name: "The Old Ferry", reason: "Your plan's limit on places is reached." }] });
  });
});
