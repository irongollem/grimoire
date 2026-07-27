import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSceneGeneratorPool, type SceneGeneratorConfig } from "./sceneGenerators";

/**
 * A generator is timers plus randomness, so both are pinned here: fake timers
 * for the schedule, a fixed RNG for level and pan. `random: () => 0.5` makes
 * every draw the midpoint of its range, which keeps the expected numbers below
 * readable rather than magic.
 */

function makeEngine() {
  return {
    attach: vi.fn(),
    setSoundTrim: vi.fn(),
    setPan: vi.fn(),
    setSoundVolume: vi.fn(),
  };
}

function makeAudio(): HTMLAudioElement {
  const el = document.createElement("audio");
  el.play = vi.fn(() => Promise.resolve());
  return el;
}

const CONFIG: SceneGeneratorConfig = {
  soundId: "drip",
  fileUrl: "https://example.test/drip.ogg",
  gainTrim: 0.9,
  minIntervalS: 10,
  maxIntervalS: 20, // midpoint 15s
  minGain: 0.4,
  maxGain: 0.8, // midpoint 0.6
  panSpread: 0.6,
  layerVolume: 0.5,
};

function setup(overrides: Partial<SceneGeneratorConfig> = {}) {
  const engine = makeEngine();
  const audio = makeAudio();
  const getAudio = vi.fn(() => audio);
  const pool = createSceneGeneratorPool({ engine, getAudio, random: () => 0.5 });
  return { engine, audio, getAudio, pool, config: { ...CONFIG, ...overrides } };
}

describe("createSceneGeneratorPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules the first firing rather than firing on start", () => {
    const { pool, audio, config } = setup();
    pool.start(config);

    expect(audio.play).not.toHaveBeenCalled();
    expect(pool.has("drip")).toBe(true);

    vi.advanceTimersByTime(14_999);
    expect(audio.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("folds the layer volume into each firing's level and pans within the spread", () => {
    const { pool, engine, config } = setup();
    pool.start(config);
    vi.advanceTimersByTime(15_000);

    // Gain midpoint 0.6 × layer volume 0.5. Compared loosely because the draw
    // is float arithmetic, not a lookup.
    expect(engine.setSoundVolume).toHaveBeenCalledWith("drip", expect.closeTo(0.3, 10), 0);
    // Midpoint of [-0.6, 0.6].
    expect(engine.setPan).toHaveBeenCalledWith("drip", 0);
    expect(engine.attach).toHaveBeenCalledWith("drip", expect.anything(), "ambient");
    expect(engine.setSoundTrim).toHaveBeenCalledWith("drip", 0.9);
  });

  it("keeps firing on a fresh interval after each one-shot", () => {
    const { pool, audio, config } = setup();
    pool.start(config);

    vi.advanceTimersByTime(45_000);
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it("skips the trim call when the sound has no trim", () => {
    const { pool, engine, config } = setup({ gainTrim: undefined });
    pool.start(config);
    vi.advanceTimersByTime(15_000);

    expect(engine.setSoundTrim).not.toHaveBeenCalled();
  });

  it("survives a refused one-shot and stays scheduled", async () => {
    const { pool, audio, config } = setup();
    audio.play = vi.fn(() => Promise.reject(new Error("autoplay blocked")));
    pool.start(config);

    vi.advanceTimersByTime(15_000);
    await Promise.resolve();
    vi.advanceTimersByTime(15_000);

    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("pauses without forgetting, and resumes", () => {
    const { pool, audio, config } = setup();
    pool.start(config);
    vi.advanceTimersByTime(15_000);
    expect(audio.play).toHaveBeenCalledTimes(1);

    pool.pause(["drip"]);
    vi.advanceTimersByTime(60_000);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(pool.has("drip")).toBe(true);

    pool.resume(["drip"]);
    vi.advanceTimersByTime(15_000);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("forgets on stop, so a later resume does nothing", () => {
    const { pool, audio, config } = setup();
    pool.start(config);

    pool.stop(["drip"]);
    expect(pool.has("drip")).toBe(false);

    pool.resume(["drip"]);
    vi.advanceTimersByTime(60_000);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("does not leave an orphaned timer when a live layer is restarted", () => {
    const { pool, audio, config } = setup();
    pool.start(config);
    vi.advanceTimersByTime(10_000);
    pool.start(config);

    // The first schedule would have fired at 15s. Only the restarted one counts.
    vi.advanceTimersByTime(5_000);
    expect(audio.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("reports whether it owns a sound when the layer volume changes", () => {
    const { pool, engine, config } = setup();
    pool.start(config);

    expect(pool.setLayerVolume("not-a-generator", 0.5)).toBe(false);
    expect(pool.setLayerVolume("drip", 1)).toBe(true);

    vi.advanceTimersByTime(15_000);
    // Gain midpoint 0.6 × the new layer volume of 1.
    expect(engine.setSoundVolume).toHaveBeenCalledWith("drip", expect.closeTo(0.6, 10), 0);
  });

  it("clamps the layer volume into range", () => {
    const { pool, engine, config } = setup();
    pool.start(config);
    pool.setLayerVolume("drip", 4);

    vi.advanceTimersByTime(15_000);
    expect(engine.setSoundVolume).toHaveBeenCalledWith("drip", expect.closeTo(0.6, 10), 0);
  });

  it("stops everything at once", () => {
    const { pool, audio, config } = setup();
    pool.start(config);
    pool.start({ ...config, soundId: "crow" });
    expect(pool.activeIds()).toEqual(["drip", "crow"]);

    pool.stopAll();
    expect(pool.activeIds()).toEqual([]);

    vi.advanceTimersByTime(60_000);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("collapses a degenerate range to its single value", () => {
    const { pool, audio, config } = setup({ minIntervalS: 5, maxIntervalS: 5 });
    pool.start(config);

    vi.advanceTimersByTime(5_000);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
