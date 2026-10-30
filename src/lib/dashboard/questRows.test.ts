import { describe, expect, it } from "vitest";
import { buildQuestRows } from "./questRows";
import type { CampaignLiveQuest, Quest } from "@/types/quest.types";

const chain = (
  quest_id: string,
  runtime_status: CampaignLiveQuest["runtime_status"],
  quest_title = quest_id,
): CampaignLiveQuest => ({
  quest_id, quest_title, quest_status: "active", beat_id: `${quest_id}-beat`,
  beat_title: "02. Main Keep", beat_kind: "explore", runtime_status,
  version: 1, updated_at: "2026-08-22T00:00:00Z",
  thread_id: `${quest_id}-thread`, thread_label: "Main", thread_status: "live", sibling_count: 0,
});

const quest = (id: string, title: string) => ({ id, title }) as Quest;
const noGiver = () => null;

describe("buildQuestRows", () => {
  // The bug this exists for: "The Unseen" showed under both "Party is here" and
  // "Active", because the dashboard stacked three lists instead of merging them.
  it("gives a quest one row even when it is in a lane and holds a cursor", () => {
    const rows = buildQuestRows(
      [chain("q1", "running", "The Unseen")],
      [quest("q1", "The Unseen"), quest("q2", "Nature Spirits")],
      noGiver,
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.id === "q1")).toHaveLength(1);
  });

  // A cursor is the strongest thing you can say about a quest, and it carries
  // the beat — more use at a glance than who handed the quest over.
  it("lets the cursor win over the lane", () => {
    const rows = buildQuestRows(
      [chain("q1", "running", "The Unseen")],
      [quest("q1", "The Unseen")],
      () => "Trovus",
    );
    expect(rows[0]).toMatchObject({ stage: "here", secondary: "02. Main Keep", runLink: true });
  });

  it("falls back to the giver when there is no cursor", () => {
    const rows = buildQuestRows([], [quest("q1", "The Unseen")], () => "Trovus");
    expect(rows[0]).toMatchObject({ stage: "active", secondary: "Given by Trovus", runLink: false });
  });

  it("orders by how urgent the stage is, then by title", () => {
    const rows = buildQuestRows(
      [chain("q1", "running", "Running one"), chain("q2", "waiting", "Waiting one")],
      [quest("q3", "Bravo"), quest("q4", "Alpha")],
      noGiver,
    );
    expect(rows.map((row) => row.stage)).toEqual(["here", "here", "active", "active"]);
    expect(rows[2]!.title).toBe("Alpha");
  });

  // A quest can hold a cursor while sitting in neither lane — completed and
  // revisited, say. The chain carries its own title, so it still gets a row.
  it("keeps a chain whose quest is in no lane", () => {
    const rows = buildQuestRows([chain("q9", "waiting", "A callback")], [], noGiver);
    expect(rows).toEqual([
      { id: "q9", title: "A callback", secondary: "02. Main Keep", stage: "here", runLink: true },
    ]);
  });

  it("names an untitled quest rather than rendering a blank row", () => {
    const rows = buildQuestRows([], [quest("q1", "")], noGiver);
    expect(rows[0]!.title).toBe("Untitled Quest");
  });

  // A session ending no longer pauses anything, so a chain parked at a
  // converge beat is as much "where the party left off" as a running one.
  it("marks a waiting chain as here, since ending a session leaves threads as they are", () => {
    const rows = buildQuestRows([chain("q1", "waiting")], [], noGiver);
    expect(rows[0]!.stage).toBe("here");
  });

  it("names an untitled chain and shows no secondary line when its beat has no title", () => {
    const blank = { ...chain("q1", "running", ""), beat_title: "" };
    expect(buildQuestRows([blank], [], noGiver)[0]).toMatchObject({
      title: "Untitled Quest",
      secondary: null,
    });
  });

  it("shows no secondary line for a lane quest nobody gave", () => {
    expect(buildQuestRows([], [quest("q1", "The Unseen")], noGiver)[0]!.secondary).toBeNull();
  });
});
