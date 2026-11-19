import { describe, expect, it } from "vitest";
import { toItem } from "./useLevelMilestones";

// The panel must agree with what the database counts (`private.reach_level_milestones`): a quest is done when
// `completed`, an objective when `complete`. The two words differ, and a panel that used one for both would show a
// milestone as further along, or further behind, than the party level says.
describe("toItem", () => {
  const quest = (status: string) =>
    toItem({ id: "s", quest_id: "q", objective_id: null, quest: { title: "The Salt Road", status }, objective: null });
  const objective = (status: string) =>
    toItem({
      id: "s",
      quest_id: null,
      objective_id: "o",
      quest: null,
      objective: { description: "Find the tower", status, quest_id: "q9", quest: { title: "The Old Map" } },
    });

  it.each([
    ["completed", true],
    ["active", false],
    ["failed", false],
  ])("a quest %s counts as done: %s", (status, done) => {
    expect(quest(status).done).toBe(done);
  });

  it.each([
    ["complete", true],
    ["pending", false],
    ["failed", false],
  ])("an objective %s counts as done: %s", (status, done) => {
    expect(objective(status).done).toBe(done);
  });

  it("an objective names its quest, so two alike in different quests can be told apart", () => {
    expect(objective("pending")).toMatchObject({ label: "Find the tower", questTitle: "The Old Map", questId: null, inQuestId: "q9" });
  });
});
