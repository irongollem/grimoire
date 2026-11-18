import { describe, expect, it } from "vitest";
import type { Coins, HandsChange } from "../_shared/agent/hands.ts";
import { makeTurnTools, type FiledFact, type TurnToolsInput } from "./turnTools";
import { NO_QUESTS, type QuestMove } from "../_shared/agent/quests";
import type { FightPlan } from "../_shared/agent/fight";
import type { PendingRoll } from "../_shared/agent/playerRoll";
import type { SessionRow } from "./handler";
import type { CallModel } from "../_shared/agent/types";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const PLACE = "00000000-0000-4000-8000-0000000000a5";
const FIGHT = "00000000-0000-4000-8000-0000000000f7";
const MEMBER = "00000000-0000-4000-8000-0000000000e1";
const HONEYCOMB_ID = "00000000-0000-4000-8000-0000000000d7";
const PLACED = "00000000-0000-4000-8000-0000000000b9";
const ATTIC_FIGHT = "00000000-0000-4000-8000-0000000000f8";
const session: SessionRow = {
  id: "00000000-0000-4000-8000-0000000000a1",
  user_id: "00000000-0000-4000-8000-0000000000d1",
  campaign_id: CAMPAIGN,
  summary: null,
  summary_through_seq: 0,
  scene_location_id: null,
  campaign_session_id: null,
  opened_play_session: false,
  left_at: null,
  pressure_clock_id: null,
  party_member_id: null,
  pending_roll: null,
  fight_encounter_id: null,
};

const HANDOUT = "00000000-0000-4000-8000-0000000000f2";
const PICTURED = "00000000-0000-4000-8000-0000000000f1";

type HandsFixture = Omit<NonNullable<TurnToolsInput["hands"]>, "memberId" | "onChange">;

function build(quests: TurnToolsInput["quests"] = null, played = false, hands: HandsFixture | null = null) {
  const handed: HandsChange[] = [];
  const handedOut: string[] = [];
  const asked: PendingRoll[] = [];
  const fights: FightPlan[] = [];
  const calls: string[] = [];
  const filed: FiledFact[] = [];
  const moves: Array<{ id: string; name: string }> = [];
  const callModel: CallModel = async () => {
    throw new Error("no model in this test");
  };
  const turn = makeTurnTools({
    deps: {
      tools: [{ name: "search", description: "", inputSchema: {} }],
      findCharacters: async () => [],
      isTableMadeCharacter: async () => false,
      callTool: async (name) => {
        calls.push(`campaign:${name}`);
        return { content: "from the campaign", isError: false };
      },
      loadSpeaker: async () => null,
      setScene: async (_s, _c, id) => ({ id, name: "Cellar", kind: null, description: "", within: null, withinId: null, beside: [], places: [], characters: [] }),
      fileFact: async () => ({ id: "00000000-0000-4000-8000-00000000f001" }),
    },
    campaignId: CAMPAIGN,
    session,
    stored: [],
    provider: "openai",
    model: "m1",
    callModel,
    onMove: (p) => moves.push(p),
    peoples: [],
    onIntroduce: () => {},
    fightChange: null,
    hitPoints: null,
    hands: hands === null ? null : { memberId: MEMBER, ...hands, onChange: (change) => { handed.push(change); } },
    filed,
    quests,
    askRoll: played ? (pending) => asked.push(pending) : null,
    show: played
      ? {
        handouts: [{ id: HANDOUT, title: "The Guild's letter" }],
        picture: async (_what, id) => (id === PICTURED ? { title: "Honeycomb", url: "https://assets.example/h.webp" } : null),
        onHandout: (handout) => { handedOut.push(handout.id); },
      }
      : null,
    fight: played ? { view: { prepared: [{ id: FIGHT, name: "The cellar rats", creatures: "" }], fight: null }, viewAt: async () => ({ prepared: [{ id: ATTIC_FIGHT, name: "The attic bats", creatures: "" }], fight: null }), onStart: (plan) => { fights.push(plan); }, statless: async () => [] } : null,
  });
  return { turn, calls, filed, moves, asked, fights, handed, handedOut };
}

describe("makeTurnTools", () => {
  it("offers the campaign's tools, speech, go_to and record together, or the narrator loses one of them", () => {
    const names = build().turn.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search", "speak", "act", "go_to", "record"]));
  });

  it("runs record itself and never hands it to the campaign's tools, which would answer 'unknown tool'", async () => {
    const { turn, calls, filed } = build();
    const answer = await turn.callTool("record", { fact: "Wren holds the key." });
    expect(answer.isError).toBe(false);
    expect(filed).toEqual([{ id: "00000000-0000-4000-8000-00000000f001", body: "Wren holds the key.", hidden: false }]);
    expect(calls).toEqual([]);
  });

  it("runs go_to itself and reports the arrival", async () => {
    const { turn, moves, calls } = build();
    await turn.callTool("go_to", { location_id: PLACE });
    expect(moves).toEqual([{ id: PLACE, name: "Cellar" }]);
    expect(calls).toEqual([]);
  });

  it("sends any other tool to the campaign's own", async () => {
    const { turn, calls } = build();
    await turn.callTool("search", {});
    expect(calls).toEqual(["campaign:search"]);
  });

  it("runs a quest tool itself and never hands it to the campaign's tools, which would answer 'unknown tool'", async () => {
    const queued: QuestMove[] = [];
    const { turn, calls } = build({ state: NO_QUESTS, queued });
    expect(turn.tools.map((t) => t.name)).toContain("quest_route");
    const answer = await turn.callTool("pressure", { stop: true });
    expect(answer.isError).toBe(false);
    expect(queued).toEqual([{ kind: "pressure", mode: "stop" }]);
    expect(calls).toEqual([]);
  });

  it("offers no quest tool when the quests could not be read", () => {
    expect(build(null).turn.tools.map((t) => t.name)).not.toContain("quest_route");
  });

  it("offers ask_roll only when someone is played, so a table with no sheet is never asked to roll from one", () => {
    expect(build(null, true).turn.tools.map((t) => t.name)).toContain("ask_roll");
    expect(build().turn.tools.map((t) => t.name)).not.toContain("ask_roll");
  });

  it("hands a call to ask_roll at a table with nobody played to the campaign's tools, which refuse it", async () => {
    const { turn, calls, asked } = build();
    await turn.callTool("ask_roll", { kind: "check", skill: "stealth", dc: 12 });
    expect(asked).toEqual([]);
    expect(calls).toEqual(["campaign:ask_roll"]);
  });

  it("takes one roll a turn and refuses a second, which would silently replace the first", async () => {
    const { turn, asked } = build(null, true);
    const first = await turn.callTool("ask_roll", { kind: "check", skill: "stealth", dc: 12 });
    const second = await turn.callTool("ask_roll", { kind: "save", ability: "con", dc: 14 });
    expect(first.isError).toBe(false);
    expect(second.isError).toBe(true);
    expect(asked.map((a) => a.label)).toEqual(["Dexterity (Stealth)"]);
  });

  it("asks nothing for a call it cannot read, and a later good call still counts as the turn's one", async () => {
    const { turn, asked } = build(null, true);
    expect((await turn.callTool("ask_roll", { kind: "check", dc: 12 })).isError).toBe(true);
    expect((await turn.callTool("ask_roll", { kind: "check", skill: "arcana", dc: 12 })).isError).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("never tells the narrator's tool result the DC back in a form the page could show", async () => {
    const { turn } = build(null, true);
    const result = await turn.callTool("ask_roll", { kind: "check", skill: "stealth", dc: 23 });
    expect(result.content).not.toContain("23");
  });

  it("starts one fight a turn and refuses a second, which would silently replace the first", async () => {
    const { turn, fights } = build(null, true);
    expect((await turn.callTool("start_fight", { encounter_id: FIGHT })).isError).toBe(false);
    expect((await turn.callTool("start_fight", { encounter_id: FIGHT })).isError).toBe(true);
    expect(fights).toHaveLength(1);
  });

  it("starts nothing for a fight it cannot read, and the turn's one fight is still free", async () => {
    const { turn, fights } = build(null, true);
    expect((await turn.callTool("start_fight", { encounter_id: PLACE })).isError).toBe(true);
    expect((await turn.callTool("start_fight", { encounter_id: FIGHT })).isError).toBe(false);
    expect(fights).toHaveLength(1);
  });

  // Bug caught live (17 Nov 2026): the party walked to another room and the narrator started the fight of the room
  // it had left, the only one it had been shown.
  it("after the party moves, lists and starts the new place's fights and no longer the old place's", async () => {
    const { turn, fights } = build(null, true);
    const went = await turn.callTool("go_to", { location_id: PLACE });
    expect(went.content).toContain("The attic bats");
    expect((await turn.callTool("start_fight", { encounter_id: FIGHT })).isError).toBe(true);
    expect((await turn.callTool("start_fight", { encounter_id: ATTIC_FIGHT })).isError).toBe(false);
    expect(fights).toEqual([{ kind: "prepared", encounterId: ATTIC_FIGHT, name: "The attic bats" }]);
  });

  describe("the characters keeping the floor", () => {
    // Bug caught (seen live): after saying "they go on", the narrator kept asking characters to speak in the same
    // reply until the turn's token budget ran out, so one beat cost what many turns cost.
    it("lets nobody speak again in a reply once the narrator said they go on", async () => {
      const { turn } = build(null, true);
      expect((await turn.callTool("keep_talking", { why: "who lost the key" })).isError).toBe(false);
      const again = await turn.callTool("speak", { speaker_id: HONEYCOMB_ID, happening: "h" });
      expect(again.isError).toBe(true);
      expect(again.content).toContain("next reply");
    });
  });

  describe("putting something in front of the player", () => {
    // Bug caught: the same letter handed over twice in one reply; or a handout the narrator was never shown (a
    // guessed id) handed over.
    it("hands over a prepared handout once, and nothing that was not prepared", async () => {
      const { turn, handedOut } = build(null, true);
      const given = await turn.callTool("show", { handout_id: HANDOUT });
      expect(given).toMatchObject({ isError: false, shown: { kind: "handout", id: HANDOUT, title: "The Guild's letter" } });
      expect((await turn.callTool("show", { handout_id: HANDOUT })).isError).toBe(true);
      expect((await turn.callTool("show", { handout_id: PICTURED })).isError).toBe(true);
      expect(handedOut).toEqual([HANDOUT]);
    });

    // Bug caught: a picture "shown" for a record that has none (an empty frame on the page), or one the narrator
    // described rather than the campaign's own.
    it("shows the campaign's own picture of a record, and says so when there is none", async () => {
      const { turn } = build(null, true);
      expect(await turn.callTool("show", { person_id: PICTURED })).toMatchObject({ isError: false, shown: { kind: "picture", of: "person", title: "Honeycomb", url: "https://assets.example/h.webp" } });
      const none = await turn.callTool("show", { place_id: HANDOUT });
      expect(none.isError).toBe(true);
      expect(none.content).toContain("Describe it in words");
    });

    // Bug caught: a reply that is a page of pictures.
    it("stops at a few things in one reply", async () => {
      const { turn } = build(null, true);
      for (let i = 0; i < 3; i += 1) expect((await turn.callTool("show", { person_id: PICTURED })).isError).toBe(false);
      expect((await turn.callTool("show", { person_id: PICTURED })).isError).toBe(true);
    });

    // Bug caught: the tool offered with nobody played, when there are no hands to take a handout.
    it("is offered only when someone is played", () => {
      expect(build(null, true).turn.tools.map((t) => t.name)).toContain("show");
      expect(build(null, false).turn.tools.map((t) => t.name)).not.toContain("show");
    });
  });

  describe("things changing hands", () => {
    const COIN_VALUES = new Map([["gp", 100], ["sp", 10], ["cp", 1]]);
    const coinsText = (coins: Coins) => Object.entries(coins).map(([k, n]) => `${n} ${k}`).join(" ");
    const hands = (over: Partial<HandsFixture> = {}): HandsFixture => ({
      possessions: { carried: [{ name: "Rope", quantity: 1 }], more: 0, purse: { gp: 5 }, wares: [{ name: "Lantern", ref: { itemId: "00000000-0000-4000-8000-0000000000a9", libraryItemId: null }, price: { gp: 3 }, priceText: "3 gp" }], loot: [{ id: PLACED, name: "Tower-Door Key", quantity: 1, ref: { itemId: "00000000-0000-4000-8000-0000000000aa", libraryItemId: null }, coins: null, beat: "The Landing" }] },
      coinValues: COIN_VALUES,
      coinsText,
      store: {
        belonging: async (_c, id, thing) => (id === HONEYCOMB_ID && thing === "Workshop Keys" ? { rowId: "r1", name: "Workshop Keys", quantity: 1, ref: { itemId: null, libraryItemId: null }, owner: "Honeycomb" } : null),
        characterName: async (_c, id) => (id === HONEYCOMB_ID ? "Honeycomb" : null),
        carried: async (_c, _m, thing) => (thing === "Rope" ? { rowId: "r2", name: "Rope", quantity: 1, ref: { itemId: null, libraryItemId: null } } : null),
        item: async () => null,
      },
      ...over,
    });

    // Bug caught: a gift told and nothing moved; or a thing "given" that the giver never had.
    it("takes a gift the giver really has, and refuses one they have not", async () => {
      const { turn, handed } = build(null, true, hands());
      expect((await turn.callTool("hand_over", { giver: HONEYCOMB_ID, receiver: "player", thing: "Workshop Keys" })).isError).toBe(false);
      expect((await turn.callTool("hand_over", { giver: HONEYCOMB_ID, receiver: "player", thing: "Crown Jewels" })).isError).toBe(true);
      expect(handed).toEqual([{ kind: "to_player", from: { id: HONEYCOMB_ID, name: "Honeycomb" }, thing: "Workshop Keys", quantity: 1 }]);
    });

    // Bug caught: the player giving away what they do not carry.
    it("lets the player give only what they carry", async () => {
      const { turn, handed } = build(null, true, hands());
      expect((await turn.callTool("hand_over", { giver: "player", receiver: HONEYCOMB_ID, thing: "Sword" })).isError).toBe(true);
      expect((await turn.callTool("hand_over", { giver: "player", receiver: HONEYCOMB_ID, thing: "Rope" })).isError).toBe(false);
      expect(handed.map((h) => h.kind)).toEqual(["from_player"]);
    });

    // Bug caught: the same 5 gp spent twice in one reply (a lantern at 3 gp, then a 3 gp bribe).
    it("counts the purse down within the turn, so two payments cannot share the same coins", async () => {
      const { turn, handed } = build(null, true, hands());
      expect((await turn.callTool("buy", { thing: "Lantern" })).isError).toBe(false);
      expect((await turn.callTool("coins", { change: "pay", coin: "gp", amount: 3, why: "A bribe" })).isError).toBe(true);
      expect((await turn.callTool("coins", { change: "pay", coin: "gp", amount: 2, why: "A bribe" })).isError).toBe(false);
      expect(handed.map((h) => h.kind)).toEqual(["buy", "pay"]);
    });

    // Bug caught: the narrator naming how many coins were found.
    it("gains only what the narrator rolled", async () => {
      const { turn, handed } = build(null, true, hands());
      expect((await turn.callTool("coins", { change: "gain", coin: "gp", amount: 500, why: "The hound's hoard" })).isError).toBe(true);
      expect(handed).toEqual([]);
    });

    // Bug caught: the same prepared key found twice in one reply (two rows in the pack, one placement); a
    // placement the campaign never put within reach taken by a guessed id.
    it("finds something the campaign placed once, and nothing it did not place here", async () => {
      const { turn, handed } = build(null, true, hands());
      expect((await turn.callTool("take", { placement_id: PLACED })).isError).toBe(false);
      expect((await turn.callTool("take", { placement_id: PLACED })).isError).toBe(true);
      expect((await turn.callTool("take", { placement_id: "00000000-0000-4000-8000-0000000000ff" })).isError).toBe(true);
      expect(handed).toEqual([{ kind: "loot", placementId: PLACED, thing: "Tower-Door Key", quantity: 1, ref: { itemId: "00000000-0000-4000-8000-0000000000aa", libraryItemId: null }, coins: null }]);
    });

    // Bug caught: a chest holding more than it gives up emptied whole by its placement_id alone; chest_things sent
    // for an ordinary find taken as one; a refused opening counted as the chest's one opening.
    it("opens a chest once, for the things named, and takes chest_things for nothing but a chest", async () => {
      const CHEST = "00000000-0000-4000-8000-0000000000c1";
      const none = { itemId: null, libraryItemId: null };
      const dagger = { atomId: "a1", name: "Silvered Dagger", ref: none, coins: null };
      const coin = { atomId: "a2", name: "", ref: none, coins: { gp: 30 } };
      const base = hands();
      const withChest = hands({ possessions: { ...base.possessions, loot: [...base.possessions.loot, { id: CHEST, name: "Smuggler's cache", quantity: 1, ref: none, coins: null, beat: null, chest: { picks: 1, things: [dagger, coin] } }] } });
      const { turn, handed } = build(null, true, withChest);
      expect((await turn.callTool("take", { placement_id: CHEST })).isError).toBe(true);
      expect((await turn.callTool("take", { placement_id: PLACED, chest_things: ["a1"] })).isError).toBe(true);
      expect((await turn.callTool("take", { placement_id: CHEST, chest_things: ["a2"] })).isError).toBe(false);
      expect((await turn.callTool("take", { placement_id: CHEST, chest_things: ["a1"] })).isError).toBe(true);
      expect(handed).toEqual([{ kind: "chest", placementId: CHEST, chest: "Smuggler's cache", things: [coin] }]);
    });

    // Bug caught: the tools offered where nothing may change hands (nobody played, a fight on the board).
    it("is not offered without what the character carries", () => {
      const { turn } = build(null, true, null);
      expect(turn.tools.map((t) => t.name)).not.toContain("hand_over");
    });
  });
});
