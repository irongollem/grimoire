import { describe, it, expect, vi } from "vitest";
import type { AudioEngine } from "./audioEngine";

// ── Minimal fake Web Audio graph ────────────────────────────────────────────
//
// Exposes just enough of the real AudioContext/AudioNode/AudioParam surface
// for audioEngine.ts to build its graph and schedule ramps against, while
// recording every scheduling call so tests can assert on *how* a value was
// scheduled (anchor-before-ramp, which ramp type), not just its end state.
// The single `as unknown as AudioContext` cast at the loadEngine() boundary
// is the only place DOM-lib compatibility matters — mirrors the existing
// `as unknown as CanvasRenderingContext2D` pattern used elsewhere in this repo.

class FakeAudioParam {
  value = 1;
  calls: Array<{ method: string; args: number[] }> = [];

  setValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: "setValueAtTime", args: [value, time] });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: "linearRampToValueAtTime", args: [value, time] });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: "exponentialRampToValueAtTime", args: [value, time] });
    return this;
  }

  cancelScheduledValues(time: number): FakeAudioParam {
    this.calls.push({ method: "cancelScheduledValues", args: [time] });
    return this;
  }
}

class FakeAudioNode {
  connections: FakeAudioNode[] = [];

  connect(dest: FakeAudioNode): FakeAudioNode {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.connections = [];
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

class FakeMediaElementSource extends FakeAudioNode {
  constructor(public mediaElement: HTMLAudioElement) {
    super();
  }
}

class FakeAudioContext {
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "running";
  destination = new FakeAudioNode();

  gains: FakeGainNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  sources: FakeMediaElementSource[] = [];

  resume = vi.fn(async () => {
    this.state = "running";
  });

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createMediaElementSource(el: HTMLAudioElement): FakeMediaElementSource {
    const node = new FakeMediaElementSource(el);
    this.sources.push(node);
    return node;
  }
}

function asAudioContext(ctx: FakeAudioContext | null): AudioContext | null {
  return ctx as unknown as AudioContext | null;
}

/** Fresh module instance per call so the engine's module-scope state never leaks between tests. */
async function loadEngine(ctx: FakeAudioContext | null): Promise<AudioEngine> {
  vi.resetModules();
  vi.doMock("@/lib/audioContext", () => ({
    getAudioContext: () => asAudioContext(ctx),
    primeAudioContext: () => {},
  }));
  const mod = await import("./audioEngine");
  return mod.getAudioEngine();
}

function makeAudioEl(): HTMLAudioElement {
  return document.createElement("audio");
}

// Node creation order on the FIRST call that touches the graph: ensureGraph()
// builds master, then music/ambient/effects (in that source order); attach()
// additionally creates a filter and a per-sound gain afterward. Tests key off
// this fixed order rather than exporting internal graph state.
function graphNodes(ctx: FakeAudioContext) {
  const [master, music, ambient, effects, soundGain] = ctx.gains;
  return { master, music, ambient, effects, soundGain };
}

describe("audioEngine", () => {
  describe("graph wiring", () => {
    it("wires a sound through filter -> soundGain -> its bus -> master -> destination", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();

      engine.attach("s1", el, "music");

      const { master, music, ambient, effects, soundGain } = graphNodes(ctx);
      const [source] = ctx.sources;
      const [filter] = ctx.filters;

      expect(source.connections).toContain(filter);
      expect(filter.connections).toContain(soundGain);
      expect(soundGain.connections).toContain(music);
      expect(music.connections).toContain(master);
      expect(ambient.connections).toContain(master);
      expect(effects.connections).toContain(master);
      expect(master.connections).toContain(ctx.destination);
    });

    it("setBusVolume ramps only the targeted bus", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1); // materialize the graph without attaching a sound
      const { music, ambient } = graphNodes(ctx);

      engine.setBusVolume("music", 0.4, 0);

      expect(music.gain.value).toBeCloseTo(0.4);
      expect(ambient.gain.value).toBe(1); // untouched
    });
  });

  describe("volume ramps", () => {
    it("schedules an exponential ramp for a normal (non-silent) volume change", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.5, 200);

      expect(soundGain.gain.value).toBeCloseTo(0.5);
      const methods = soundGain.gain.calls.map((c) => c.method);
      expect(methods).toEqual([
        "cancelScheduledValues",
        "setValueAtTime",
        "exponentialRampToValueAtTime",
      ]);
      expect(soundGain.gain.calls[2]?.args).toEqual([0.5, 0.2]);
    });

    it("uses an instant setValueAtTime when rampMs is 0 (the default)", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.3);

      expect(soundGain.gain.value).toBeCloseTo(0.3);
      const methods = soundGain.gain.calls.map((c) => c.method);
      expect(methods).toEqual(["cancelScheduledValues", "setValueAtTime", "setValueAtTime"]);
    });

    it("composes trim and volume multiplicatively on the sound gain", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundTrim("s1", 0.6);
      engine.setSoundVolume("s1", 0.5);

      expect(soundGain.gain.value).toBeCloseTo(0.3);
    });

    it("setSoundTrim applies instantly regardless of call order relative to setSoundVolume", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.5);
      engine.setSoundTrim("s1", 0.6);

      expect(soundGain.gain.value).toBeCloseTo(0.3);
    });
  });

  describe("fadeIn / fadeOut", () => {
    it("fadeOut always uses a linear ramp to reach exact silence, even from a loud value", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);
      engine.setSoundVolume("s1", 1); // well above the silence floor first

      await engine.fadeOut("s1", 100);

      const last = soundGain.gain.calls.at(-1);
      expect(last?.method).toBe("linearRampToValueAtTime");
      expect(last?.args).toEqual([0, 0.1]);
      expect(soundGain.gain.value).toBe(0);
    });

    it("fadeOut's promise resolves only after the ramp duration elapses", async () => {
      vi.useFakeTimers();
      try {
        const ctx = new FakeAudioContext();
        const engine = await loadEngine(ctx);
        const el = makeAudioEl();
        engine.attach("s1", el, "music");

        let resolved = false;
        const p = engine.fadeOut("s1", 300).then(() => {
          resolved = true;
        });

        await Promise.resolve(); // flush microtasks
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(300);
        expect(resolved).toBe(true);
        await p;
      } finally {
        vi.useRealTimers();
      }
    });

    it("fadeIn ramps from silence back up to the sound's configured volume", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      engine.setSoundVolume("s1", 0.7);
      await engine.fadeOut("s1", 0);
      const { soundGain } = graphNodes(ctx);
      expect(soundGain.gain.value).toBe(0);

      engine.fadeIn("s1", 150);

      expect(soundGain.gain.value).toBeCloseTo(0.7);
      // Ramping FROM true silence can't use exponentialRamp either — must be linear.
      const last = soundGain.gain.calls.at(-1);
      expect(last?.method).toBe("linearRampToValueAtTime");
    });
  });

  describe("ducking", () => {
    it("duck attenuates music and ambient but leaves effects untouched, unduck restores", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1); // materialize the graph
      const { music, ambient, effects } = graphNodes(ctx);
      const before = { music: music.gain.value, ambient: ambient.gain.value, effects: effects.gain.value };

      engine.duck();

      expect(music.gain.value).toBeCloseTo(before.music * 0.25);
      expect(ambient.gain.value).toBeCloseTo(before.ambient * 0.25);
      expect(effects.gain.value).toBe(before.effects);

      engine.unduck();

      expect(music.gain.value).toBeCloseTo(before.music);
      expect(ambient.gain.value).toBeCloseTo(before.ambient);
    });

    it("duck depth is configurable via its second argument", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);
      const before = music.gain.value;

      engine.duck(50, 0.1);

      expect(music.gain.value).toBeCloseTo(before * 0.1);
    });
  });

  describe("effect presets", () => {
    it("applies the correct lowpass cutoff/Q/gain for a preset via linear ramps", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "effects");
      const { soundGain } = graphNodes(ctx);
      const [filter] = ctx.filters;

      engine.setEffect("s1", "through_wall", 100);

      expect(filter.frequency.value).toBe(220);
      expect(filter.Q.value).toBe(0.8);
      expect(soundGain.gain.value).toBeCloseTo(0.25); // volume(1) * trim(1) * effect gain(0.25)

      const freqMethods = filter.frequency.calls.map((c) => c.method);
      expect(freqMethods).toEqual(["cancelScheduledValues", "setValueAtTime", "linearRampToValueAtTime"]);
    });

    it("'none' restores the fully-open filter", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      engine.setEffect("s1", "cave", 50);

      engine.setEffect("s1", "none", 50);

      const [filter] = ctx.filters;
      expect(filter.frequency.value).toBe(22000);
      expect(filter.Q.value).toBeCloseTo(0.7071);
    });

    it("composes with a previously-set volume/trim rather than overwriting them", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);
      engine.setSoundVolume("s1", 0.8);
      engine.setSoundTrim("s1", 0.5);

      engine.setEffect("s1", "through_door", 0); // effect gain 0.50

      expect(soundGain.gain.value).toBeCloseTo(0.8 * 0.5 * 0.5); // 0.2
    });
  });

  describe("attach / detach", () => {
    it("attach is idempotent per soundId — a second call with the same element reuses the chain", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();

      engine.attach("s1", el, "music");
      engine.attach("s1", el, "music");

      expect(ctx.sources.length).toBe(1);
      expect(ctx.filters.length).toBe(1);
      // master, music, ambient, effects, soundGain — no extra soundGain created
      expect(ctx.gains.length).toBe(5);
    });

    it("re-attaching an already-attached sound to a new bus re-routes without rebuilding the chain", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain, music, effects } = graphNodes(ctx);

      engine.attach("s1", el, "effects");

      expect(ctx.sources.length).toBe(1); // no re-creation
      expect(soundGain.connections).not.toContain(music);
      expect(soundGain.connections).toContain(effects);
    });

    it("detach disconnects the chain; re-attaching the same element does not call createMediaElementSource again", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain } = graphNodes(ctx);
      const [source] = ctx.sources;
      const [filter] = ctx.filters;

      engine.detach("s1");

      expect(source.connections).toEqual([]);
      expect(filter.connections).toEqual([]);
      expect(soundGain.connections).toEqual([]);

      engine.attach("s1", el, "music");
      // createMediaElementSource can only be called ONCE per element, ever —
      // the cached node must be reused, not recreated.
      expect(ctx.sources.length).toBe(1);
    });

    it("detach on an unknown soundId is a safe no-op", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      expect(() => engine.detach("nope")).not.toThrow();
    });
  });

  describe("resume", () => {
    it("resumes a suspended context", async () => {
      const ctx = new FakeAudioContext();
      ctx.state = "suspended";
      const engine = await loadEngine(ctx);

      engine.resume();

      expect(ctx.resume).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the context is already running", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);

      engine.resume();

      expect(ctx.resume).not.toHaveBeenCalled();
    });
  });

  describe("availability", () => {
    it("available is true when a context exists", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      expect(engine.available).toBe(true);
    });

    it("marks the engine unavailable and every method is a safe no-op when there is no AudioContext", async () => {
      const engine = await loadEngine(null);
      const el = makeAudioEl();

      expect(engine.available).toBe(false);
      expect(() => engine.attach("s1", el, "music")).not.toThrow();
      expect(() => engine.detach("s1")).not.toThrow();
      expect(() => engine.setSoundVolume("s1", 0.5, 100)).not.toThrow();
      expect(() => engine.setSoundTrim("s1", 1.2)).not.toThrow();
      expect(() => engine.setBusVolume("music", 0.5, 100)).not.toThrow();
      expect(() => engine.setMasterVolume(0.5, 100)).not.toThrow();
      expect(() => engine.fadeIn("s1", 200)).not.toThrow();
      await expect(engine.fadeOut("s1", 200)).resolves.toBeUndefined();
      expect(() => engine.duck()).not.toThrow();
      expect(() => engine.unduck()).not.toThrow();
      expect(() => engine.setEffect("s1", "cave", 100)).not.toThrow();
      expect(() => engine.resume()).not.toThrow();
    });
  });
});
