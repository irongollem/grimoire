import { describe, expect, it } from "vitest";
import { chaptersText, srtText, type CueInput } from "./sidecars";

describe("chaptersText", () => {
  it("pins the first chapter to 0:00 even though the first shot starts after the intro", () => {
    // YouTube ignores a chapter list that does not begin at 0:00.
    const text = chaptersText([{ title: "Intro", start: 1.2 }, { title: "Damage", start: 75.5 }], 120);
    expect(text).toBe("0:00 Intro\n1:15 Damage");
  });
  it("uses h:mm:ss on every line once the video passes an hour", () => {
    const text = chaptersText([{ title: "A", start: 1.2 }, { title: "B", start: 3725 }], 3800);
    expect(text).toBe("0:00:00 A\n1:02:05 B");
  });
  it("floors a chapter start rather than rounding it up into the next second", () => {
    expect(chaptersText([{ title: "A", start: 0 }, { title: "B", start: 59.9 }], 100)).toContain("0:59 B");
  });
});

const shot = (over: Partial<CueInput>): CueInput => ({ start: 10, length: 8, voStart: 0.15, voDuration: 4, narration: "One. Two.", ...over });

describe("srtText", () => {
  it("starts the first cue at the shot's start plus the voice-over lead", () => {
    expect(srtText([shot({})])).toMatch(/^1\n00:00:10,150 --> /);
  });
  it("shares the voice-over's duration between sentences by length", () => {
    // 4 + 12 characters over 4 s: a 1 s cue, then a 3 s cue.
    const [first, second] = srtText([shot({ narration: "Abc. Defghijklmn." })]).trim().split("\n\n");
    expect(first).toBe("1\n00:00:10,150 --> 00:00:11,150\nAbc.");
    expect(second).toBe("2\n00:00:11,150 --> 00:00:14,150\nDefghijklmn.");
  });
  it("never runs a cue past the shot's end", () => {
    // A voice-over longer than its shot (a stale take against a re-filmed clip).
    const srt = srtText([shot({ length: 3, voDuration: 9 })]);
    expect(srt).toContain("--> 00:00:13,000");
    expect(srt).not.toMatch(/--> 00:00:1[4-9]/);
  });
  it("gives a shot without a voice-over no cue and keeps numbering across shots", () => {
    const srt = srtText([shot({ voStart: null, voDuration: null }), shot({ start: 20, narration: "Only." })]);
    expect(srt.startsWith("1\n00:00:20,150")).toBe(true);
    expect(srt.match(/-->/g)).toHaveLength(1);
  });
  it("formats an hour into the hours field", () => {
    expect(srtText([shot({ start: 3600 })])).toContain("01:00:00,150");
  });
});
