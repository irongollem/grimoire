import { describe, expect, it } from "vitest";
import { defaultThreadId, orderThreads, threadBadge, threadBadges, threadLetter, threadTitle, threadTone } from "./threads";
import type { ThreadLike } from "./threads";

const thread = (id: string, status: ThreadLike["status"], created_at: string, label = id): ThreadLike => ({ id, status, created_at, label });

describe("orderThreads", () => {
  it("keeps the oldest live thread first and pushes closed and merged threads behind", () => {
    const ordered = orderThreads([
      thread("merged", "merged", "2026-09-01T00:00:00Z"),
      thread("second", "live", "2026-09-03T00:00:00Z"),
      thread("closed", "closed", "2026-09-02T00:00:00Z"),
      thread("first", "live", "2026-09-02T00:00:00Z"),
      thread("waiting", "waiting", "2026-09-04T00:00:00Z"),
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["first", "second", "waiting", "closed", "merged"]);
  });

  it("does not mutate the input", () => {
    const input = [thread("b", "live", "2"), thread("a", "live", "1")];
    orderThreads(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("threadLetter", () => {
  it("letters the first twenty-six and keeps going honestly", () => {
    expect(threadLetter(0)).toBe("A");
    expect(threadLetter(2)).toBe("C");
    expect(threadLetter(25)).toBe("Z");
    expect(threadLetter(26)).toBe("AA");
    expect(threadLetter(-1)).toBe("?");
  });
});

describe("threadTone", () => {
  it("paints the first three threads gold, info and arcane, then wraps", () => {
    expect(threadTone(0).text).toBe("text-primary");
    expect(threadTone(1).text).toBe("text-ink-info");
    expect(threadTone(2).text).toBe("text-ink-arcane");
    expect(threadTone(3)).toEqual(threadTone(0));
  });

  it("uses ink tokens for text and tone tokens for fills, never the reverse", () => {
    for (const index of [0, 1, 2]) {
      const tone = threadTone(index);
      expect(tone.text).toMatch(/^text-(primary|ink-)/);
      expect(tone.bg).toMatch(/^bg-(primary|tone-)/);
    }
  });

  it("gives the swimlane wash a much fainter fill than a badge background", () => {
    for (const index of [0, 1, 2]) {
      const tone = threadTone(index);
      expect(tone.bgFaint).toMatch(/^bg-(primary|tone-\w+)\/5$/);
      expect(tone.bgFaint).not.toBe(tone.bg);
    }
  });
});

describe("threadBadges", () => {
  const threads = [
    thread("vault", "live", "2026-09-03T00:00:00Z", "The Drowned Vault"),
    thread("main", "live", "2026-09-01T00:00:00Z", "The petition"),
  ];

  it("hands every surface the same letter and tone for a thread", () => {
    const badges = threadBadges(threads);
    expect(badges.map((b) => [b.letter, b.thread.id, b.tone.text])).toEqual([
      ["A", "main", "text-primary"],
      ["B", "vault", "text-ink-info"],
    ]);
    expect(threadBadge(threads, "vault")?.letter).toBe("B");
    expect(threadBadge(threads, "missing")).toBeNull();
  });

  it("titles a thread the way the thread bar reads it", () => {
    expect(threadTitle(threadBadges(threads)[0]!)).toBe("A · The petition");
  });

  it("lands on the oldest live thread when the route names none", () => {
    expect(defaultThreadId(threads)).toBe("main");
    expect(defaultThreadId([thread("done", "closed", "1")])).toBeNull();
  });
});
