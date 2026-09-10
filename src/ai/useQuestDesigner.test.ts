import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "campaign-1" }),
}));

import { useQuestDesigner } from "./useQuestDesigner";
import { QUEST_DESIGN_PROSE_LIMIT, QUEST_DESIGN_TURN_BUDGET, type QuestDesignTree } from "@/lib/quests/designer";

function tree(overrides: Partial<QuestDesignTree> = {}): QuestDesignTree {
  return {
    title: "The Silent Bell",
    summary: "Something rings under the church at night.",
    objectives: [{ description: "Investigate the bell" }],
    tags: [],
    ...overrides,
  };
}

function turnResponse(overrides: Record<string, unknown> = {}) {
  return {
    tree: tree(),
    questions: [],
    note: "Proposed a haunted-bell hook.",
    turn: 1,
    turns_left: QUEST_DESIGN_TURN_BUDGET - 1,
    ai_provenance: { generatorType: "quest_design", provider: "openai", model: "gpt-5", generatedAt: "2026-09-10T00:00:00.000Z", edited: false },
    ...overrides,
  };
}

describe("useQuestDesigner", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it("propose(): sends prose only on turn 1 and stores the result", async () => {
    mocks.invoke.mockResolvedValue({ data: turnResponse(), error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls under an abandoned church at midnight.";

    await designer.propose();

    expect(mocks.invoke).toHaveBeenCalledWith("quest-designer-turn", {
      body: {
        campaign_id: "campaign-1",
        prose: "A bell tolls under an abandoned church at midnight.",
        turn: 1,
        tree: null,
        answers: [],
      },
    });
    expect(designer.tree.value).toEqual(tree());
    expect(designer.previousTree.value).toBeNull();
    expect(designer.turn.value).toBe(1);
    expect(designer.turnsLeft.value).toBe(QUEST_DESIGN_TURN_BUDGET - 1);
    expect(designer.note.value).toBe("Proposed a haunted-bell hook.");
    expect(designer.error.value).toBe("");
    expect(designer.isGenerating.value).toBe(false);
  });

  it("propose(): refuses prose over the limit without calling the edge function", async () => {
    const designer = useQuestDesigner();
    designer.prose.value = "x".repeat(QUEST_DESIGN_PROSE_LIMIT + 1);

    await designer.propose();

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(designer.error.value).not.toBe("");
    expect(designer.tree.value).toBeNull();
  });

  it("propose(): refuses empty prose without calling the edge function", async () => {
    const designer = useQuestDesigner();
    designer.prose.value = "   ";

    await designer.propose();

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(designer.error.value).not.toBe("");
  });

  it("answer(): appends to the cumulative answer log, increments the turn, and sends the standing tree", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: turnResponse({ turn: 1 }), error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls under an abandoned church at midnight.";
    await designer.propose();

    const secondTree = tree({ title: "The Silent Bell (revised)" });
    mocks.invoke.mockResolvedValueOnce({
      data: turnResponse({ tree: secondTree, turn: 2, note: "Narrowed the antagonist." }),
      error: null,
    });

    await designer.answer([{ question_key: "q1", question: "Who rings the bell?", answer: "A vengeful ghost" }]);

    expect(mocks.invoke).toHaveBeenLastCalledWith("quest-designer-turn", {
      body: {
        campaign_id: "campaign-1",
        prose: "A bell tolls under an abandoned church at midnight.",
        turn: 2,
        tree: tree(),
        answers: [{ question_key: "q1", question: "Who rings the bell?", answer: "A vengeful ghost" }],
      },
    });
    expect(designer.answers.value).toEqual([
      { question_key: "q1", question: "Who rings the bell?", answer: "A vengeful ghost" },
    ]);
    expect(designer.turn.value).toBe(2);
    expect(designer.previousTree.value).toEqual(tree());
    expect(designer.tree.value).toEqual(secondTree);
    expect(designer.note.value).toBe("Narrowed the antagonist.");
  });

  it("answer(): refuses once the turn budget is exhausted", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: turnResponse({ turn: 1 }), error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls.";
    await designer.propose();
    designer.turn.value = QUEST_DESIGN_TURN_BUDGET;

    await designer.answer([{ question_key: "q1", question: "Q", answer: "A" }]);

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(designer.error.value).not.toBe("");
  });

  it("answer(): leaves the answers unrecorded when the turn fails, so a retry sends them once", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: turnResponse({ turn: 1 }), error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls.";
    await designer.propose();

    mocks.invoke.mockResolvedValueOnce({ data: { error: "rate_limited" }, error: null });
    await designer.answer([{ question_key: "q1", question: "Q", answer: "A" }]);

    expect(designer.error.value).not.toBe("");
    expect(designer.answers.value).toEqual([]);
    expect(designer.turn.value).toBe(1);
  });

  it("answer(): refuses when no tree has been proposed yet", async () => {
    const designer = useQuestDesigner();
    await designer.answer([{ question_key: "q1", question: "Q", answer: "A" }]);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(designer.error.value).not.toBe("");
  });

  it("surfaces an edge function error via edgeErrorMessage", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "insufficient credits" } });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls.";

    await designer.propose();

    expect(designer.error.value).toBe("insufficient credits");
    expect(designer.isGenerating.value).toBe(false);
    expect(designer.tree.value).toBeNull();
  });

  it("surfaces a structured data.error from a 200 response", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "rate_limited" }, error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls.";

    await designer.propose();

    expect(designer.error.value).toBe("rate_limited");
  });

  it("reset(): clears every piece of state", async () => {
    mocks.invoke.mockResolvedValue({ data: turnResponse(), error: null });
    const designer = useQuestDesigner();
    designer.prose.value = "A bell tolls.";
    await designer.propose();

    designer.reset();

    expect(designer.prose.value).toBe("");
    expect(designer.tree.value).toBeNull();
    expect(designer.previousTree.value).toBeNull();
    expect(designer.questions.value).toEqual([]);
    expect(designer.answers.value).toEqual([]);
    expect(designer.note.value).toBe("");
    expect(designer.turn.value).toBe(0);
    expect(designer.provenance.value).toBeNull();
    expect(designer.error.value).toBe("");
  });
});
