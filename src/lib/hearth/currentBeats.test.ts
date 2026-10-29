import { describe, expect, it } from "vitest";
import type { PlayerQuestBeat } from "@/types/quest.types";
import { currentBeatsByQuest } from "./currentBeats";

function beat(o: Partial<PlayerQuestBeat> & Pick<PlayerQuestBeat, "id" | "quest_id">): PlayerQuestBeat {
  return {
    campaign_id: "c",
    visibility: "revealed",
    kind: "scene",
    presentation_hint: null,
    player_text: null,
    story_order: 0,
    attachments: [],
    visits: [],
    updated_at: "",
    staged_at_location_id: null,
    thread_id: "main",
    thread_label: "Main",
    is_current: false,
    payoff: [],
    ...o,
  } as PlayerQuestBeat;
}
const q = (id: string, updated_at: string, status = "active") => ({ id, title: `Quest ${id}`, status, updated_at });

describe("currentBeatsByQuest", () => {
  it("summarises a rich-text beat as its plain words and skips an emptied doc (#1115)", () => {
    const words = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cross the bridge"}]}]}';
    const blank = '{"type":"doc","content":[{"type":"paragraph"}]}';
    const out = currentBeatsByQuest(
      [q("a", "2026-01-01"), q("b", "2026-01-02")],
      [
        beat({ id: "1", quest_id: "a", is_current: true, player_text: words }),
        beat({ id: "2", quest_id: "b", is_current: true, player_text: blank }),
      ],
    );
    expect(out.find((x) => x.questId === "a")!.current).toEqual([{ threadLabel: null, text: "Cross the bridge" }]);
    expect(out.find((x) => x.questId === "b")!.current).toEqual([]);
  });

  it("orders quests by updated_at desc and keeps ones without a current beat", () => {
    const out = currentBeatsByQuest(
      [q("a", "2026-01-01"), q("b", "2026-03-01"), q("done", "2026-05-01", "completed")],
      [beat({ id: "1", quest_id: "a", is_current: true, player_text: "Find the key" })],
    );
    expect(out.map((o) => o.questId)).toEqual(["b", "a"]);
    expect(out[0].current).toEqual([]);
    expect(out[1].current).toEqual([{ threadLabel: null, text: "Find the key" }]);
  });

  it("puts Main first and labels threads when several are current", () => {
    const out = currentBeatsByQuest(
      [q("a", "2026-01-01")],
      [
        beat({ id: "1", quest_id: "a", thread_id: "t2", thread_label: "The Heist", story_order: 1, is_current: true, player_text: "Cross the roof" }),
        beat({ id: "2", quest_id: "a", is_current: true, player_text: "Talk to the baron" }),
      ],
    );
    expect(out[0].current).toEqual([
      { threadLabel: "Main", text: "Talk to the baron" },
      { threadLabel: "The Heist", text: "Cross the roof" },
    ]);
  });

  it("shows only the beats that are current, with their text trimmed", () => {
    const out = currentBeatsByQuest(
      [q("a", "2026-01-01")],
      [
        beat({ id: "1", quest_id: "a", is_current: false, player_text: "Already done" }),
        beat({ id: "2", quest_id: "a", is_current: true, player_text: "  Open the gate  " }),
      ],
    );
    expect(out[0].current).toEqual([{ threadLabel: null, text: "Open the gate" }]);
  });

  it("skips current beats with no text and other quests' beats", () => {
    const out = currentBeatsByQuest(
      [q("a", "2026-01-01")],
      [
        beat({ id: "1", quest_id: "a", is_current: true, player_text: "  " }),
        beat({ id: "2", quest_id: "a", is_current: true, player_text: null }),
        beat({ id: "3", quest_id: "other", is_current: true, player_text: "Not mine" }),
      ],
    );
    expect(out[0].current).toEqual([]);
  });
});
