import { describe, expect, it, vi } from "vitest";
import { writeQuestSpine, type WriteQuestSpineDeps, type WriteQuestSpineInput } from "./spineWrite";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import type {
  QuestBeat,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestConsequenceInsert,
  QuestObjective,
  QuestObjectiveInsert,
} from "@/types/quest.types";

/** Batch fakes that hand each row back with an id the way the database
 *  would: `beat-<canvas index>`, `objective-<sort_order>`. Returned in
 *  REVERSE order on purpose, so a test passes only if the writer keys rows
 *  by the columns it set rather than by position. */
function makeDeps(overrides: Partial<WriteQuestSpineDeps> = {}): WriteQuestSpineDeps {
  return {
    createBeats: vi.fn(async (beats: QuestBeatInsert[]): Promise<QuestBeat[]> =>
      beats.map((beat) => ({ ...beat, id: `beat-${beat.canvas_x / 320}` }) as QuestBeat).reverse(),
    ),
    createBeatEdges: vi.fn(async (_edges: QuestBeatEdgeInsert[]): Promise<void> => {}),
    createObjectives: vi.fn(async (objectives: QuestObjectiveInsert[]): Promise<QuestObjective[]> =>
      objectives.map((objective) => ({ ...objective, id: `objective-${objective.sort_order}` }) as QuestObjective).reverse(),
    ),
    createConsequences: vi.fn(async (_consequences: QuestConsequenceInsert[]): Promise<void> => {}),
    ...overrides,
  };
}

/** Every row a batch dep was handed, across all its calls, in call order. */
function rowsOf<T>(fn: (rows: T[]) => unknown): T[] {
  return vi.mocked(fn).mock.calls.flatMap((call) => call[0]);
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

const threeBeats: QuestSpineBeatResult[] = [
  ...twoBeats,
  { key: "resolve", title: "Report back", dm_content: "", kind: "neutral" },
];

describe("writeQuestSpine", () => {
  it("lays beats out 320px apart in story order and maps each key to its real id, whatever order rows come back in", async () => {
    const deps = makeDeps();

    const result = await writeQuestSpine(baseInput({ beats: threeBeats }), deps);

    const beats = rowsOf(deps.createBeats);
    expect(beats.map((b) => [b.title, b.canvas_x, b.canvas_y])).toEqual([
      ["The bell rings", 0, 0],
      ["Face the ringer", 320, 0],
      ["Report back", 640, 0],
    ]);
    expect(result.beatIdByKey.get("opening")).toBe("beat-0");
    expect(result.beatIdByKey.get("confront")).toBe("beat-1");
    expect(result.beatIdByKey.get("resolve")).toBe("beat-2");
  });

  // #951: one request per list, not per row. The opening beat goes alone
  // because its insert settles the quest's entry beat, which breaks ties on
  // `created_at` — identical across one multi-row insert.
  it("writes the opening beat alone, then every later beat in one request, then one request per list", async () => {
    const deps = makeDeps();
    const objectives: QuestObjectiveResult[] = [
      { description: "Root-raised", raised_by: "opening" },
      { description: "Later-raised", raised_by: "resolve" },
    ];
    const routes: QuestSpineRouteResult[] = [
      { from: "opening", to: "confront" },
      { from: "confront", to: "resolve" },
    ];

    await writeQuestSpine(baseInput({ beats: threeBeats, routes, objectives }), deps);

    expect(vi.mocked(deps.createBeats).mock.calls.map((call) => call[0].map((b) => b.title))).toEqual([
      ["The bell rings"],
      ["Face the ringer", "Report back"],
    ]);
    expect(deps.createBeatEdges).toHaveBeenCalledTimes(1);
    expect(rowsOf(deps.createBeatEdges)).toHaveLength(2);
    expect(deps.createObjectives).toHaveBeenCalledTimes(1);
    expect(deps.createConsequences).toHaveBeenCalledTimes(1);
    expect(rowsOf(deps.createConsequences)).toHaveLength(2);
  });

  it("does not start the later beats before the opening beat has landed", async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const order: string[] = [];
    const deps = makeDeps({
      createBeats: vi.fn(async (beats: QuestBeatInsert[]): Promise<QuestBeat[]> => {
        const titles = beats.map((b) => b.title).join("+");
        order.push(`start:${titles}`);
        if (titles === "The bell rings") await firstGate;
        order.push(`done:${titles}`);
        return beats.map((beat) => ({ ...beat, id: `beat-${beat.canvas_x / 320}` }) as QuestBeat);
      }),
    });

    const pending = writeQuestSpine(baseInput({ beats: twoBeats }), deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["start:The bell rings"]);

    resolveFirst();
    await pending;
    expect(order).toEqual(["start:The bell rings", "done:The bell rings", "start:Face the ringer", "done:Face the ringer"]);
  });

  it("stages a beat at the location the caller resolved for its key, in the beat insert itself", async () => {
    const deps = makeDeps();

    await writeQuestSpine(
      baseInput({ beats: twoBeats, stagedLocationIdByKey: new Map([["confront", "location-9"]]) }),
      deps,
    );

    const beats = rowsOf(deps.createBeats);
    expect(beats[0]!.staged_at_location_id).toBeNull();
    expect(beats[1]!.staged_at_location_id).toBe("location-9");
  });

  it("drops a route to a beat that never landed and keeps one between two that did", async () => {
    const deps = makeDeps();
    const routes: QuestSpineRouteResult[] = [
      { from: "opening", to: "confront" },
      { from: "opening", to: "ghost" },
    ];

    await writeQuestSpine(baseInput({ beats: twoBeats, routes }), deps);

    expect(rowsOf(deps.createBeatEdges)).toHaveLength(1);
    expect(rowsOf(deps.createBeatEdges)[0]).toMatchObject({
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

    const statuses = rowsOf(deps.createObjectives).map((row) => row.status);
    expect(statuses).toEqual(["pending", "dormant", "pending"]);
  });

  it("keeps every beat but the one the database refused, and still writes the objectives", async () => {
    const deps = makeDeps({
      createBeats: vi.fn(async (beats: QuestBeatInsert[]): Promise<QuestBeat[]> => {
        if (beats.some((beat) => beat.title === "Face the ringer")) throw { message: "refused" };
        return beats.map((beat) => ({ ...beat, id: `beat-${beat.canvas_x / 320}` }) as QuestBeat);
      }),
    });
    const objectives: QuestObjectiveResult[] = [{ description: "Root-raised", raised_by: "opening" }];

    const result = await writeQuestSpine(baseInput({ beats: threeBeats, objectives }), deps);

    // The refused batch is retried a row at a time, so "Report back" still
    // lands beside the one bad row. Best-effort: the quest already landed.
    expect(result.beatIdByKey.get("opening")).toBe("beat-0");
    expect(result.beatIdByKey.has("confront")).toBe(false);
    expect(result.beatIdByKey.get("resolve")).toBe("beat-2");
    expect(rowsOf(deps.createObjectives)).toHaveLength(1);
  });

  it("writes no later beats when the opening beat is refused, so the entry beat is never a random one", async () => {
    const deps = makeDeps({
      createBeats: vi.fn(async (): Promise<QuestBeat[]> => { throw { message: "refused" }; }),
    });

    const result = await writeQuestSpine(baseInput({ beats: threeBeats }), deps);

    expect(deps.createBeats).toHaveBeenCalledTimes(1);
    expect(result.beatIdByKey.size).toBe(0);
  });

  it("skips the raise for an objective the database refused, and keeps the others", async () => {
    const deps = makeDeps({
      createObjectives: vi.fn(async (objectives: QuestObjectiveInsert[]): Promise<QuestObjective[]> => {
        if (objectives.some((o) => o.description === "Bad")) throw { message: "refused" };
        return objectives.map((o) => ({ ...o, id: `objective-${o.sort_order}` }) as QuestObjective);
      }),
    });
    const objectives: QuestObjectiveResult[] = [
      { description: "Bad", raised_by: "opening" },
      { description: "Good", raised_by: "confront" },
    ];

    const result = await writeQuestSpine(baseInput({ beats: twoBeats, objectives }), deps);

    expect(result.objectives.map((o) => o.id)).toEqual(["objective-1"]);
    expect(rowsOf(deps.createConsequences)).toEqual([
      expect.objectContaining({ on_beat_id: "beat-1", target_objective_id: "objective-1" }),
    ]);
  });

  // The two columns a player is actually shown. They were hard-coded to null
  // here until 2 Oct 2026, so every imported or generated beat arrived with
  // nothing a player could ever see.
  it("writes each beat's rumor and reveal copy as plain text, and null when the spine has none", async () => {
    const deps = makeDeps();
    const beats: QuestSpineBeatResult[] = [
      {
        key: "opening",
        title: "The bell rings",
        dm_content: "",
        kind: "neutral",
        rumor_text: "They say the bell rings by itself.",
        reveal_text: "The bell rang, and nobody was in the tower.",
      },
      { key: "confront", title: "Face the ringer", dm_content: "", kind: "combat", rumor_text: "  ", reveal_text: "" },
    ];

    await writeQuestSpine(baseInput({ beats }), deps);

    const calls = rowsOf(deps.createBeats);
    expect(calls[0]).toMatchObject({
      rumor_text: "They say the bell rings by itself.",
      reveal_text: "The bell rang, and nobody was in the tower.",
    });
    expect(calls[1]!.rumor_text).toBeNull();
    expect(calls[1]!.reveal_text).toBeNull();
  });

  it("still lands a beat hidden when it arrives with player copy", async () => {
    const deps = makeDeps();
    const beats: QuestSpineBeatResult[] = [
      { key: "opening", title: "The bell rings", dm_content: "", kind: "neutral", rumor_text: "A rumour.", reveal_text: "A reveal." },
    ];

    await writeQuestSpine(baseInput({ beats }), deps);

    expect(rowsOf(deps.createBeats)[0]!.visibility).toBe("hidden");
  });

  it("writes read_aloud as Tiptap JSON when the draft has boxed text, and null when it doesn't", async () => {
    const deps = makeDeps();
    const beats: QuestSpineBeatResult[] = [
      { key: "opening", title: "The bell rings", dm_content: "", kind: "neutral", read_aloud: "The bell tolls thrice." },
      { key: "confront", title: "Face the ringer", dm_content: "", kind: "neutral" },
    ];

    await writeQuestSpine(baseInput({ beats }), deps);

    const calls = rowsOf(deps.createBeats);
    expect(calls[0]!.read_aloud).toBe(toTiptapJson("The bell tolls thrice."));
    expect(calls[1]!.read_aloud).toBeNull();
  });

  it("creates one raise consequence per objective whose raised_by names a beat that landed, and returns the created objectives", async () => {
    const deps = makeDeps();
    const objectives: QuestObjectiveResult[] = [
      { description: "Learn who rings the bell", raised_by: "opening" },
      { description: "Confront the ringer", raised_by: "confront" },
    ];

    const result = await writeQuestSpine(baseInput({ beats: twoBeats, objectives }), deps);

    const consequences = rowsOf(deps.createConsequences);
    expect(consequences).toHaveLength(2);
    expect(consequences[0]).toMatchObject({
      on_beat_id: "beat-0",
      action: "raise",
      target_objective_id: "objective-0",
    });
    expect(consequences[1]).toMatchObject({
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

    expect(deps.createBeats).not.toHaveBeenCalled();
    expect(deps.createBeatEdges).not.toHaveBeenCalled();
    expect(deps.createConsequences).not.toHaveBeenCalled();
    expect(result.beatIdByKey.size).toBe(0);
    expect(rowsOf(deps.createObjectives)[0]!.status).toBe("pending");
  });
});
