import { describe, expect, it, vi } from "vitest";
import type { JudgeRequest, JudgeResult } from "../typesafe";
import { flaggedForRoll, isJudgedForRoll, lastNarratorText, needsRoll, rollCheckRequest, ROLL_NEEDED_MIN, SCENE_MAX_CHARS } from "./rollCheck";
import type { AgentMessage } from "./types";

const answer = (noul: number | null): JudgeResult => ({
  model: "jev-1",
  inputTokens: 5,
  answers: noul === null ? {} : { roll: { type: "noul", noul } },
});

describe("which messages are judged", () => {
  const base = { mode: "do" as const, message: "I pick the lock.", answersRoll: false, fightRunning: false };

  it("judges a say or a do with words in it", () => {
    expect(isJudgedForRoll(base)).toBe(true);
    expect(isJudgedForRoll({ ...base, mode: "say" })).toBe(true);
  });

  // Each skip is a way to spend a judgment, or hint the narrator, where no uncertain attempt can be.
  it.each([
    ["a DM-facing question", { mode: "ask" as const }],
    ["a correction", { mode: "correct" as const }],
    ["an empty message", { message: "   " }],
    ["a message that answers a roll", { answersRoll: true }],
    ["a turn in a running fight, which has its own rolls", { fightRunning: true }],
  ])("does not judge %s", (_name, over) => {
    expect(isJudgedForRoll({ ...base, ...over })).toBe(false);
  });
});

describe("the request", () => {
  it("sends the tail of the scene, the part nearest the action, and no more than the limit", () => {
    const scene = `${"a".repeat(SCENE_MAX_CHARS)}THE-DOOR-IS-LOCKED`;
    const state = rollCheckRequest({ mode: "do", message: "I pick it.", scene }).state as { scene: string };
    expect(state.scene.endsWith("THE-DOOR-IS-LOCKED")).toBe(true);
    expect(state.scene).toHaveLength(SCENE_MAX_CHARS);
  });

  it("takes the narrator's newest shown text, skipping text the player never saw", () => {
    const history: AgentMessage[] = [
      { role: "assistant", blocks: [{ type: "text", text: "Old news." }] },
      { role: "user", blocks: [{ type: "text", text: "I wait." }] },
      { role: "assistant", blocks: [{ type: "text", text: "The door is locked." }, { type: "text", text: "Hidden repeat.", unshown: true }] },
    ];
    expect(lastNarratorText(history)).toBe("The door is locked.");
    expect(lastNarratorText([])).toBe("");
  });
});

describe("flaggedForRoll", () => {
  const request: JudgeRequest = rollCheckRequest({ mode: "do", message: "I climb the wall.", scene: "" });
  const run = (judge: ((r: JudgeRequest) => Promise<JudgeResult>) | null, limitMs = 50) => flaggedForRoll({ judge, request, limitMs });

  it("flags at the threshold and not just under it", async () => {
    expect(await run(async () => answer(ROLL_NEEDED_MIN))).toBe(ROLL_NEEDED_MIN);
    expect(await run(async () => answer(ROLL_NEEDED_MIN - 0.01))).toBeNull();
  });

  it("reads a missing answer as not flagged", async () => {
    expect(needsRoll(answer(null))).toBeNull();
    expect(await run(async () => answer(null))).toBeNull();
  });

  it("fails open with no judge", async () => {
    expect(await run(null)).toBeNull();
  });

  it("fails open, and says it was skipped, when the judge throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await run(async () => { throw new Error("down"); })).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("fails open when the judge is slower than the limit, without waiting for it", async () => {
    vi.useFakeTimers();
    try {
      const pending = run(() => new Promise<JudgeResult>(() => {}), 1_500);
      await vi.advanceTimersByTimeAsync(1_501);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
