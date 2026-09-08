import { describe, expect, it, vi } from "vitest";
import { writeQuestSpine, type WriteQuestSpineDeps, type WriteQuestSpineInput } from "./spineWrite";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import type {
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestConsequence,
  QuestConsequenceInsert,
  QuestObjective,
  QuestObjectiveInsert,
} from "@/types/quest.types";

function makeDeps(overrides: Partial<WriteQuestSpineDeps> = {}): WriteQuestSpineDeps {
  let beatCount = 0;
  let objectiveCount = 0;
  return {
    createBeat: vi.fn(async (_beat: QuestBeatInsert): Promise<QuestBeat> => {
      const id = `beat-${beatCount++}`;
      return { id } as QuestBeat;
    }),
    createBeatEdge: vi.fn(async (_edge: QuestBeatEdgeInsert): Promise<QuestBeatEdge> => {
      return { id: "edge-1" } as QuestBeatEdge;
    }),
    createObjective: vi.fn(async (_objective: QuestObjectiveInsert): Promise<QuestObjective> => {
      const id = `objective-${objectiveCount++}`;
      return { id } as QuestObjective;
    }),
    createConsequence: vi.fn(async (_consequence: QuestConsequenceInsert): Promise<QuestConsequence> => {
      return { id: "consequence-1" } as QuestConsequence;
    }),
    ...overrides,
  };
}

function baseInput(overrides: Partial<WriteQuestSpineInput> = {}): WriteQuestSpineInput {
  return {
    questId: "quest-1",
    campaignId: "campaign-1",
    beats: undefined,
    routes: undefined,
    objectives: undefined,
    ...overrides,
  };
}

const twoBeats: QuestSpineBeatResult[] = [
  { key: "opening", title: "The bell rings", dm_content: "A bell tolls.", kind: "social" },
  { key: "confront", title: "Face the ringer", dm_content: "Something answers.", kind: "combat" },
];

describe("writeQuestSpine", () => {
  it("creates beats sequentially in story order, 320px apart, and maps each key to its real id", async () => {
    const deps = makeDeps();
    const threeBeats: QuestSpineBeatResult[] = [
      ...twoBeats,
      { key: "resolve", title: "Report back", dm_content: "", kind: "neutral" },
    ];

    const result = await writeQuestSpine(baseInput({ beats: threeBeats }), deps);

    expect(deps.createBeat).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(deps.createBeat).mock.calls;
    expect(calls[0]![0]).toMatchObject({ title: "The bell rings", canvas_x: 0, canvas_y: 0 });
    expect(calls[1]![0]).toMatchObject({ title: "Face the ringer", canvas_x: 320 });
    expect(calls[2]![0]).toMatchObject({ title: "Report back", canvas_x: 640 });

    expect(result.beatIdByKey.get("opening")).toBe("beat-0");
    expect(result.beatIdByKey.get("confront")).toBe("beat-1");
    expect(result.beatIdByKey.get("resolve")).toBe("beat-2");
  });

  it("does not start the next beat before the previous one has landed", async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const order: string[] = [];

    const deps = makeDeps({
      createBeat: vi.fn(async (beat: QuestBeatInsert): Promise<QuestBeat> => {
        order.push(`start:${beat.title}`);
        if (beat.title === "The bell rings") await firstGate;
        order.push(`done:${beat.title}`);
        return { id: `beat-${beat.title}` } as QuestBeat;
      }),
    });

    const pending = writeQuestSpine(baseInput({ beats: twoBeats }), deps);
    // Give the first call a tick to start (and, if this were Promise.all,
    // for the second to have started too).
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["start:The bell rings"]);

    resolveFirst();
    await pending;
    expect(order).toEqual(["start:The bell rings", "done:The bell rings", "start:Face the ringer", "done:Face the ringer"]);
  });

  it("drops a route to a beat that never landed and keeps one between two that did", async () => {
    const deps = makeDeps();
    const routes: QuestSpineRouteResult[] = [
      { from: "opening", to: "confront" },
      { from: "opening", to: "ghost" },
    ];

    await writeQuestSpine(baseInput({ beats: twoBeats, routes }), deps);

    expect(deps.createBeatEdge).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.createBeatEdge).mock.calls[0]![0]).toMatchObject({
      source_beat_id: "beat-0",
      target_beat_id: "beat-1",
    });
  });

  it("splits objectives pending/dormant by which beat raises them, unwired ones landing pending", async () => {
    const deps = makeDeps();
    const objectives: QuestObjectiveResult[] = [
      { description: "Root-raised", raised_by: "opening" },
      { description: "Later-raised", raised_by: "confront" },
      { description: "Never wired" },
    ];

    await writeQuestSpine(baseInput({ beats: twoBeats, objectives }), deps);

    const statuses = vi.mocked(deps.createObjective).mock.calls.map((call) => call[0].status);
    expect(statuses).toEqual(["pending", "dormant", "pending"]);
  });

  it("leaves the earlier beats' ids resolved when a later beat fails to create", async () => {
    const deps = makeDeps({
      createBeat: vi.fn(async (beat: QuestBeatInsert): Promise<QuestBeat> => {
        if (beat.title === "Face the ringer") throw new Error("insert failed");
        return { id: `beat-${beat.title}` } as QuestBeat;
      }),
    });
    const objectives: QuestObjectiveResult[] = [{ description: "Root-raised", raised_by: "opening" }];

    const result = await writeQuestSpine(baseInput({ beats: twoBeats, objectives }), deps);

    // The failure is caught (best-effort): the quest write already landed
    // and must not be undone by a partially wired spine.
    expect(result.beatIdByKey.get("opening")).toBe("beat-The bell rings");
    expect(result.beatIdByKey.has("confront")).toBe(false);
    // Objectives still get created past the caught beat failure.
    expect(deps.createObjective).toHaveBeenCalledTimes(1);
  });

  it("writes read_aloud as Tiptap JSON when the draft has boxed text, and null when it doesn't", async () => {
    const deps = makeDeps();
    const beats: QuestSpineBeatResult[] = [
      { key: "opening", title: "The bell rings", dm_content: "", kind: "neutral", read_aloud: "The bell tolls thrice." },
      { key: "confront", title: "Face the ringer", dm_content: "", kind: "neutral" },
    ];

    await writeQuestSpine(baseInput({ beats }), deps);

    const calls = vi.mocked(deps.createBeat).mock.calls;
    expect(calls[0]![0].read_aloud).toBe(toTiptapJson("The bell tolls thrice."));
    expect(calls[1]![0].read_aloud).toBeNull();
  });

  it("creates one raise consequence per objective whose raised_by names a beat that landed, and returns the created objectives", async () => {
    const deps = makeDeps();
    const objectives: QuestObjectiveResult[] = [
      { description: "Learn who rings the bell", raised_by: "opening" },
      { description: "Confront the ringer", raised_by: "confront" },
    ];

    const result = await writeQuestSpine(baseInput({ beats: twoBeats, objectives }), deps);

    expect(deps.createConsequence).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.createConsequence).mock.calls[0]![0]).toMatchObject({
      on_beat_id: "beat-0",
      action: "raise",
      target_objective_id: "objective-0",
    });
    expect(vi.mocked(deps.createConsequence).mock.calls[1]![0]).toMatchObject({
      on_beat_id: "beat-1",
      action: "raise",
      target_objective_id: "objective-1",
    });
    expect(result.objectives.map((o) => o.id)).toEqual(["objective-0", "objective-1"]);
  });

  it("creates no beat and every objective pending when there is no usable spine", async () => {
    const deps = makeDeps();
    const objectives: QuestObjectiveResult[] = [{ description: "Just a checklist item" }];

    const result = await writeQuestSpine(baseInput({ objectives }), deps);

    expect(deps.createBeat).not.toHaveBeenCalled();
    expect(deps.createBeatEdge).not.toHaveBeenCalled();
    expect(deps.createConsequence).not.toHaveBeenCalled();
    expect(result.beatIdByKey.size).toBe(0);
    expect(vi.mocked(deps.createObjective).mock.calls[0]![0].status).toBe("pending");
  });
});
