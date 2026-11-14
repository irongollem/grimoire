import { describe, expect, it } from "vitest";
import { carriedCues, coverOffset, planTimeline, snapToFrame, VO_LEAD, type PlannedShot, type ShotInput } from "./timeline";

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

  it("a frame count ffprobe prints rounded to six decimals keeps its count, so a looping scene does not stutter", () => {
    // 686 frames at 30 fps is 22.8666... s; ffprobe reports 22.866667 (Cup Town, 4 Nov 2026).
    expect(snapToFrame(22.866667) * 30).toBeCloseTo(686, 9);
  });

  it("a duration a real part of a frame over still gets the next frame", () => {
    expect(snapToFrame(1 + 0.1 / 30) * 30).toBeCloseTo(31, 9);
  });
});

describe("coverOffset", () => {
  it("takes the first shot's middle when the manifest names no moment", () => {
    expect(coverOffset({}, 25)).toBe(12.5);
  });

  // The prison cell (8 Nov 2026): its middle is mid-pan, with the dog behind the frame's middle bar.
  it("takes the manifest's moment when it names one", () => {
    expect(coverOffset({ coverAt: 10.5 }, 25)).toBe(10.5);
  });

  // Bug it fails on: a moment past the shot's end extracts no frame, and the Reel posts without a cover.
  it.each([25, 30, -1])("refuses a moment outside the shot (%s s of 25)", (at) => {
    expect(() => coverOffset({ coverAt: at }, 25)).toThrow(/outside the first shot/);
  });
});

describe("carriedCues", () => {
  const shot = (start: number, cues: PlannedShot["cues"] = []): PlannedShot => ({ id: `s${start}`, start, length: 4, clipDuration: 4, freeze: 0, voStart: null, cues });
  const song = { src: "song.mp3", gain: 1, local: 1.5, program: 2.5 };

  // The bug it guards: a song tapped in the first shot stopped at the first cut.
  it("carries a sound into every later shot, picked up where it has got to", () => {
    const shots = [shot(1, [song]), shot(5), shot(9)];
    expect(carriedCues(shots, 1)).toEqual([{ src: "song.mp3", gain: 1, offset: 2.5 }]);
    expect(carriedCues(shots, 2)).toEqual([{ src: "song.mp3", gain: 1, offset: 6.5 }]);
  });

  // The shot that starts the sound mixes it itself; carrying it there too would play it twice.
  it("leaves a sound out of the shot that starts it, and out of the shots before it", () => {
    const shots = [shot(1), shot(5, [{ ...song, local: 0.5, program: 5.5 }]), shot(9)];
    expect(carriedCues(shots, 0)).toEqual([]);
    expect(carriedCues(shots, 1)).toEqual([]);
    expect(carriedCues(shots, 2)).toEqual([{ src: "song.mp3", gain: 1, offset: 3.5 }]);
  });
});

