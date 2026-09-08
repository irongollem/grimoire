import { describe, expect, it } from "vitest";
import { deriveSwimlanes } from "./swimlanes";
import type { ThreadLike } from "./threads";

const thread = (id: string, status: ThreadLike["status"], created_at: string, label = id): ThreadLike =>
  ({ id, status, created_at, label });

const beats = [
  { id: "petition", canvas_x: 0, canvas_y: 0 },
  { id: "ledgers", canvas_x: 300, canvas_y: 0 },
  { id: "vallis", canvas_x: 600, canvas_y: 0 },
  { id: "rumor", canvas_x: 600, canvas_y: 400 },
];
const nodeSize = { width: 240, height: 120 };

describe("deriveSwimlanes", () => {
  it("frames the beats a live thread has visited plus wherever it stands now", () => {
    const lanes = deriveSwimlanes({
      threads: [thread("main", "live", "2026-09-01T00:00:00Z", "The petition")],
      runtime: [{ thread_id: "main", current_beat_id: "vallis" }],
      transitions: [
        { thread_id: "main", to_beat_id: "petition" },
        { thread_id: "main", to_beat_id: "ledgers" },
      ],
      beats,
      nodeSize,
    });
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ threadId: "main", letter: "A", label: "The petition", stateLabel: "party is here" });
    // Bounding box spans petition (x0) through vallis (x600+240), padded 48 either side.
    expect(lanes[0]!.x).toBe(0 - 48);
    expect(lanes[0]!.w).toBe((600 + 240 - 0) + 48 * 2);
  });

  it("omits a thread with nothing visited and no current beat", () => {
    const lanes = deriveSwimlanes({
      threads: [thread("fresh", "live", "2026-09-01T00:00:00Z")],
      runtime: [{ thread_id: "fresh", current_beat_id: null }],
      transitions: [],
      beats,
      nodeSize,
    });
    expect(lanes).toEqual([]);
  });

  it("omits closed and merged threads even when their history is on the board", () => {
    const lanes = deriveSwimlanes({
      threads: [thread("done", "closed", "2026-09-01T00:00:00Z")],
      runtime: [{ thread_id: "done", current_beat_id: "petition" }],
      transitions: [{ thread_id: "done", to_beat_id: "petition" }],
      beats,
      nodeSize,
    });
    expect(lanes).toEqual([]);
  });

  it("labels only the oldest live thread \"party is here\", a parallel sibling \"still running\", and a parked one \"waiting\"", () => {
    const lanes = deriveSwimlanes({
      threads: [
        thread("main", "live", "2026-09-01T00:00:00Z", "The petition"),
        thread("vault", "live", "2026-09-03T00:00:00Z", "The Drowned Vault"),
        thread("parked", "waiting", "2026-09-04T00:00:00Z", "The tithe wagon"),
      ],
      runtime: [
        { thread_id: "main", current_beat_id: "vallis" },
        { thread_id: "vault", current_beat_id: "rumor" },
        { thread_id: "parked", current_beat_id: "ledgers" },
      ],
      transitions: [],
      beats,
      nodeSize,
    });
    const byId = Object.fromEntries(lanes.map((lane) => [lane.threadId, lane]));
    expect(byId.main!.stateLabel).toBe("party is here");
    expect(byId.vault!.stateLabel).toBe("still running");
    expect(byId.parked!.stateLabel).toBe("waiting");
    expect(byId.main!.tone.text).toBe("text-primary");
    expect(byId.vault!.tone.text).toBe("text-ink-info");
  });
});
