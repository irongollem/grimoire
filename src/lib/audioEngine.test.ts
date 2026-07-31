import { describe, it, expect, vi } from "vitest";
import type { AudioEngine } from "@/lib/audioEngine";

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

class FakeAudioBuffer {
  private channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(index: number): Float32Array {
    return this.channels[index];
  }
}

class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
}

class FakeAudioContext {
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "running";
  destination = new FakeAudioNode();

  sampleRate = 48000;

  gains: FakeGainNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  sources: FakeMediaElementSource[] = [];
  convolvers: FakeConvolverNode[] = [];
  /** Counts IR construction so a test can prove the cache actually caches. */
  buffersCreated = 0;

  createConvolver(): FakeConvolverNode {
    const node = new FakeConvolverNode();
    this.convolvers.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, rate: number): FakeAudioBuffer {
    this.buffersCreated++;
    return new FakeAudioBuffer(channels, length, rate);
  }

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
    resumeExistingAudioContext: () => {
      if (ctx?.state === "suspended") void ctx.resume();
    },
  }));
  const mod = await import("@/lib/audioEngine");
  return mod.getAudioEngine();
}

function makeAudioEl(): HTMLAudioElement {
  return document.createElement("audio");
}

// Node creation order on the FIRST call that touches the graph.
//
// ensureGraph(): master gain, master filter, the three bus gains, the three bus
// filters, then convolver, reverb return, master send.
// attach() then adds: the sound's filter, its gain, and its reverb send.
//
// Tests key off this fixed order rather than exporting internal graph state.
function graphNodes(ctx: FakeAudioContext) {
  const [master, music, ambient, effects, reverbReturn, masterSend, soundGain, reverbSend] = ctx.gains;
  const [masterFilter, musicFilter, ambientFilter, effectsFilter, soundFilter] = ctx.filters;
  return {
    master, music, ambient, effects, reverbReturn, masterSend, soundGain, reverbSend,
    masterFilter, musicFilter, ambientFilter, effectsFilter, soundFilter,
  };
}

describe("audioEngine", () => {
  describe("graph wiring", () => {
    it("wires a sound through filter -> soundGain -> its bus -> master -> destination", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();

      engine.attach("s1", el, "music");

      const {
        master, music, ambient, effects, soundGain,
        masterFilter, musicFilter, ambientFilter, effectsFilter, soundFilter,
      } = graphNodes(ctx);
      const [source] = ctx.sources;

      expect(source.connections).toContain(soundFilter);
      expect(soundFilter.connections).toContain(soundGain);
      // Sounds land on their bus's FILTER, so a bus effect colours everything on it.
      expect(soundGain.connections).toContain(musicFilter);
      expect(musicFilter.connections).toContain(music);
      expect(ambientFilter.connections).toContain(ambient);
      expect(effectsFilter.connections).toContain(effects);
      // Buses sum into the master filter, so a master effect colours the whole mix.
      expect(music.connections).toContain(masterFilter);
      expect(ambient.connections).toContain(masterFilter);
      expect(effects.connections).toContain(masterFilter);
      expect(masterFilter.connections).toContain(master);
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
      const { soundGain, soundFilter } = graphNodes(ctx);

      engine.setEffect("s1", "through_wall", 100);

      expect(soundFilter.frequency.value).toBe(220);
      expect(soundFilter.Q.value).toBe(0.8);
      expect(soundGain.gain.value).toBeCloseTo(0.25); // volume(1) * trim(1) * effect gain(0.25)

      const freqMethods = soundFilter.frequency.calls.map((c) => c.method);
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
      // 4 from the graph (master + 3 buses) + exactly 1 for the sound.
      expect(ctx.filters.length).toBe(5);
      // master, 3 buses, reverb return, master send, soundGain, its reverb send
      // — no extras created by the second attach.
      expect(ctx.gains.length).toBe(8);
    });

    it("re-attaching an already-attached sound to a new bus re-routes without rebuilding the chain", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain, musicFilter, effectsFilter, reverbSend } = graphNodes(ctx);

      engine.attach("s1", el, "effects");

      expect(ctx.sources.length).toBe(1); // no re-creation
      expect(soundGain.connections).not.toContain(musicFilter);
      expect(soundGain.connections).toContain(effectsFilter);
      // Re-routing disconnects everything downstream of soundGain, so the
      // reverb send has to be reconnected too or the sound silently goes dry.
      expect(soundGain.connections).toContain(reverbSend);
    });

    it("detach disconnects the chain; re-attaching the same element does not call createMediaElementSource again", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { soundGain, soundFilter, masterFilter, master } = graphNodes(ctx);
      const [source] = ctx.sources;

      engine.detach("s1");

      expect(source.connections).toEqual([]);
      expect(soundFilter.connections).toEqual([]);
      expect(soundGain.connections).toEqual([]);
      // The shared graph must survive one sound detaching.
      expect(masterFilter.connections).toContain(master);

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

  describe("reverb", () => {
    it("builds one shared convolver, not one per sound", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      engine.attach("s2", makeAudioEl(), "ambient");
      engine.attach("s3", makeAudioEl(), "effects");

      expect(ctx.convolvers.length).toBe(1);
    });

    it("routes every sound's reverb send into the shared convolver", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { reverbSend, reverbReturn, master } = graphNodes(ctx);
      const [convolver] = ctx.convolvers;

      expect(reverbSend.connections).toContain(convolver);
      expect(convolver.connections).toContain(reverbReturn);
      // Returns into master GAIN, not the master filter — otherwise the tail
      // would be filtered a second time on its way out.
      expect(reverbReturn.connections).toContain(master);
    });

    it("starts dry", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { reverbSend, masterSend } = graphNodes(ctx);

      expect(reverbSend.gain.value).toBe(0);
      expect(masterSend.gain.value).toBe(0);
    });

    it("sends heavily for a space, but stays dry for occlusion", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { reverbSend } = graphNodes(ctx);

      // A cave is defined by its reflections.
      engine.setEffect("s1", "cave", 0);
      const caveSend = reverbSend.gain.value;
      expect(caveSend).toBeGreaterThan(0.4);

      // A closed door is not a space — it blocks sound, it doesn't reverberate.
      engine.setEffect("s1", "through_wall", 0);
      expect(reverbSend.gain.value).toBeLessThan(0.1);
      expect(reverbSend.gain.value).toBeLessThan(caveSend);
    });

    it("returns to fully dry on 'none'", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { reverbSend } = graphNodes(ctx);

      engine.setEffect("s1", "cave", 0);
      engine.setEffect("s1", "none", 0);

      expect(reverbSend.gain.value).toBe(0);
    });

    it("caches impulse responses instead of regenerating per call", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const afterGraph = ctx.buffersCreated;

      engine.setEffect("s1", "cave", 0);
      const afterFirstCave = ctx.buffersCreated;
      engine.setEffect("s1", "cave", 0);
      engine.setEffect("s1", "cave", 0);

      expect(afterFirstCave).toBeGreaterThan(afterGraph); // built once
      expect(ctx.buffersCreated).toBe(afterFirstCave);    // and then reused
    });
  });

  describe("bus and master effects", () => {
    it("a bus effect colours only that bus", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { musicFilter, ambientFilter } = graphNodes(ctx);

      engine.setBusEffect("music", "underwater", 0);

      expect(musicFilter.frequency.value).toBe(150);
      expect(ambientFilter.frequency.value).toBe(22000); // untouched
    });

    it("a master effect colours the whole mix", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { masterFilter, masterSend } = graphNodes(ctx);

      // The case this exists for: the party walks into a cave, so everything
      // audible is in the cave — not just whichever track was selected.
      engine.setMasterEffect("cave", 0);

      expect(masterFilter.frequency.value).toBe(900);
      expect(masterSend.gain.value).toBeGreaterThan(0.4);
    });

    it("sound, bus and master effects compose rather than clobbering each other", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundFilter, musicFilter, masterFilter } = graphNodes(ctx);

      engine.setEffect("s1", "through_door", 0);
      engine.setBusEffect("music", "distant", 0);
      engine.setMasterEffect("cave", 0);

      // A bard behind a door, heard from across the room, in a cave.
      expect(soundFilter.frequency.value).toBe(700);
      expect(musicFilter.frequency.value).toBe(1800);
      expect(masterFilter.frequency.value).toBe(900);
    });

    it("clearing the master effect leaves sound-level effects alone", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundFilter, masterFilter, masterSend } = graphNodes(ctx);

      engine.setEffect("s1", "through_door", 0);
      engine.setMasterEffect("cave", 0);
      engine.setMasterEffect("none", 0);

      expect(masterFilter.frequency.value).toBe(22000);
      expect(masterSend.gain.value).toBe(0);
      expect(soundFilter.frequency.value).toBe(700); // still behind its door
    });

    it("bus and master effects are safe no-ops without Web Audio", async () => {
      const engine = await loadEngine(null);
      expect(() => engine.setBusEffect("music", "cave", 0)).not.toThrow();
      expect(() => engine.setMasterEffect("cave", 0)).not.toThrow();
    });
  });

});
