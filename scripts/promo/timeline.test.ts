import { describe, expect, it } from "vitest";
import { planTimeline, snapToFrame, VO_LEAD, type ShotInput } from "./timeline";

const shot = (over: Partial<ShotInput> = {}): ShotInput => ({
  id: "a",
  clipDuration: 4,
  voDuration: null,
  cues: [],
  ...over,
});

describe("planTimeline", () => {
  it("a VO longer than its clip extends the shot instead of being cut off", () => {
    const t = planTimeline({ shots: [shot({ voDuration: 6 })], introLength: null, outroLength: null });
    expect(t.shots[0].length).toBeCloseTo(6.4, 5);
    expect(t.shots[0].freeze).toBeCloseTo(2.4, 5);
  });

  it("a short VO never shortens the clip", () => {
    const t = planTimeline({ shots: [shot({ voDuration: 1 })], introLength: null, outroLength: null });
    expect(t.shots[0].length).toBe(4);
    expect(t.shots[0].freeze).toBe(0);
  });

  it("a shot without VO is exactly its clip long, with no narration start", () => {
    const t = planTimeline({ shots: [shot()], introLength: null, outroLength: null });
    expect(t.shots[0].length).toBe(4);
    expect(t.shots[0].voStart).toBeNull();
  });

  it("narration starts 0.15 s into its own shot, not at program start", () => {
    const t = planTimeline({
      shots: [shot({ id: "a" }), shot({ id: "b", voDuration: 2 })],
      introLength: null,
      outroLength: null,
    });
    expect(t.shots[1].voStart).toBe(VO_LEAD);
    expect(t.shots[1].start).toBe(4);
  });

  it("a cue lands at shot start + t, not at program start + t", () => {
    const t = planTimeline({
      shots: [shot(), shot({ id: "b", cues: [{ t: 1.5, src: "/x.ogg", gain: 0.5 }] })],
      introLength: 1.2,
      outroLength: null,
    });
    const cue = t.shots[1].cues[0];
    expect(cue.local).toBe(1.5);
    expect(cue.program).toBeCloseTo(1.2 + 4 + 1.5, 5);
    expect(cue.gain).toBe(0.5);
  });

  it("a cue without a gain plays at unity", () => {
    const t = planTimeline({ shots: [shot({ cues: [{ t: 0, src: "/x.ogg" }] })], introLength: null, outroLength: null });
    expect(t.shots[0].cues[0].gain).toBe(1);
  });

  it("a cue past the end of its shot is dropped rather than bleeding into the next shot", () => {
    const t = planTimeline({ shots: [shot({ cues: [{ t: 4, src: "/x.ogg" }, { t: 3.9, src: "/y.ogg" }] })], introLength: null, outroLength: null });
    expect(t.shots[0].cues.map((c) => c.src)).toEqual(["/y.ogg"]);
  });

  it("the intro pushes every shot later and the outro follows the last shot", () => {
    const t = planTimeline({
      shots: [shot({ clipDuration: 3 }), shot({ id: "b", clipDuration: 2 })],
      introLength: 1.2,
      outroLength: 2,
    });
    expect(t.shots.map((s) => s.start)).toEqual([1.2, 4.2]);
    expect(t.outro).toEqual({ start: 6.2, length: 2 });
    expect(t.total).toBeCloseTo(8.2, 5);
  });

  it("without brand the program is just the shots", () => {
    const t = planTimeline({ shots: [shot()], introLength: null, outroLength: null });
    expect(t.intro).toBeNull();
    expect(t.outro).toBeNull();
    expect(t.total).toBe(4);
  });

  it("lengths snap up to the frame grid so segments cannot drift apart", () => {
    const t = planTimeline({ shots: [shot({ clipDuration: 3.01 })], introLength: null, outroLength: null });
    expect(t.shots[0].length * 30).toBeCloseTo(Math.round(t.shots[0].length * 30), 9);
    expect(t.shots[0].length).toBeGreaterThanOrEqual(3.01);
  });
});

describe("snapToFrame", () => {
  it("float noise on an exact frame count does not add a frame", () => {
    expect(snapToFrame(2.0000000001)).toBe(2);
  });
});
