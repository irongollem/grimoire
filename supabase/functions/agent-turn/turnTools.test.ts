import { describe, expect, it } from "vitest";
import { makeTurnTools, type FiledFact, type TurnToolsInput } from "./turnTools";
import { NO_QUESTS, type QuestMove } from "../_shared/agent/quests";
import type { SessionRow } from "./handler";
import type { CallModel } from "../_shared/agent/types";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const PLACE = "00000000-0000-4000-8000-0000000000a5";
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
};

function build(quests: TurnToolsInput["quests"] = null) {
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
      callTool: async (name) => {
        calls.push(`campaign:${name}`);
        return { content: "from the campaign", isError: false };
      },
      loadSpeaker: async () => null,
      setScene: async (_s, _c, id) => ({ id, name: "Cellar", kind: null, description: "", within: null, places: [], characters: [] }),
      fileFact: async () => ({ id: "00000000-0000-4000-8000-00000000f001" }),
    },
    campaignId: CAMPAIGN,
    session,
    stored: [],
    provider: "openai",
    model: "m1",
    callModel,
    onMove: (p) => moves.push(p),
    filed,
    quests,
  });
  return { turn, calls, filed, moves };
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
});
