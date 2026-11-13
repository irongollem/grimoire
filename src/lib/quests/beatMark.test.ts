import { describe, expect, it } from "vitest";
import { beatMark } from "./beatMark";
import type { QuestBeatPresentation } from "./presentation";

function p(reach: QuestBeatPresentation["reach"], extra: Partial<QuestBeatPresentation> = {}): QuestBeatPresentation {
  return { reach, ...extra } as QuestBeatPresentation;
}

describe("beatMark", () => {
  it("a beat that is both entry and current reads gold, not green", () => {
    expect(beatMark(p("current"), true).fill).toBe("here");
  });
  it("an entry beat already played keeps the green start fill, not white", () => {
    expect(beatMark(p("visited"), true)).toMatchObject({ fill: "start", bookmark: "done" });
  });
  it("a visited beat is white with a done bookmark", () => {
    expect(beatMark(p("visited"), false)).toMatchObject({ fill: "past", bookmark: "done" });
  });
  it("ahead and unplayed beats are pending and untouched", () => {
    expect(beatMark(p("ahead"), false)).toMatchObject({ fill: "pending", bookmark: "untouched", unreachable: false });
    expect(beatMark(p("unplayed"), false).bookmark).toBe("untouched");
  });
  it("a cut-off beat is unreachable, which differs from untouched by bookmark", () => {
    const cut = beatMark(p("stranded"), false);
    expect(cut).toMatchObject({ unreachable: true, bookmark: "unreachable" });
    expect(cut.bookmark).not.toBe(beatMark(p("ahead"), false).bookmark);
  });
  it("the legacy current flag with no presentation still reads as party here", () => {
    expect(beatMark(undefined, false, true)).toMatchObject({ fill: "here", bookmark: "here" });
  });
  it("a failed beat shows the failed bookmark, not done", () => {
    expect(beatMark(p("visited", { isFailed: true }), false).bookmark).toBe("failed");
  });
});
