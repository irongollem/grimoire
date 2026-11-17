import { describe, expect, it } from "vitest";
import { makeTurnTools, type FiledFact, type TurnToolsInput } from "./turnTools";
import { NO_QUESTS, type QuestMove } from "../_shared/agent/quests";
import type { FightPlan } from "../_shared/agent/fight";
import type { PendingRoll } from "../_shared/agent/playerRoll";
import type { SessionRow } from "./handler";
import type { CallModel } from "../_shared/agent/types";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const PLACE = "00000000-0000-4000-8000-0000000000a5";
const FIGHT = "00000000-0000-4000-8000-0000000000f7";
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

function build(quests: TurnToolsInput["quests"] = null, played = false) {
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
    filed,
    quests,
    askRoll: played ? (pending) => asked.push(pending) : null,
    fight: played ? { view: { prepared: [{ id: FIGHT, name: "The cellar rats", creatures: "" }], fight: null }, onStart: (plan) => fights.push(plan), statless: async () => [] } : null,
  });
  return { turn, calls, filed, moves, asked, fights };
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
});
