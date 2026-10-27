// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import type { AudioEngine } from "@/lib/audio/audioEngine";

// ── A small Web Audio fake that behaves like the real thing where it matters ──
//
// The tests below assert what a listener would hear (where a sound ends up, how loud it is at a given moment, what a
// filter cuts), not which AudioParam methods were called in which order. So the fake keeps a real automation
// timeline: a param's value at time t is computed from its scheduled events, a ramp starts from the event before it,
// `cancelScheduledValues` forgets the future, and an exponential ramp to zero throws as it does in a browser.

type Kind = "set" | "linear" | "exp";
interface ParamEvent {
  kind: Kind;
  v: number;
  t: number;
}

class FakeAudioParam {
  private events: ParamEvent[] = [];

  /** What the param holds when no event governs it: its starting value, or what it was when its events were cancelled. */
  private base: number;
  /** Right after a cancel a browser still reports the level it had reached, until something is scheduled. */
  private held: { t: number; v: number } | null = null;

  constructor(
    private clock: { currentTime: number },
    initial = 1,
  ) {
    this.base = initial;
  }

  /** Like a browser, `value` reads the automated value right now, and a write is a set at the current time. */
  get value(): number {
    if (this.held && this.held.t === this.clock.currentTime) return this.held.v;
    return this.valueAt(this.clock.currentTime);
  }
  set value(v: number) {
    this.setValueAtTime(v, this.clock.currentTime);
  }

  valueAt(t: number): number {
    const prev = [...this.events].reverse().find((e) => e.t <= t);
    const next = this.events.find((e) => e.t > t);
    const v0 = prev?.v ?? this.base;
    if (!next || next.kind === "set") return v0;
    const t0 = prev?.t ?? 0;
    const f = (t - t0) / (next.t - t0);
    if (next.kind === "linear") return v0 + (next.v - v0) * f;
    // An exponential ramp cannot leave zero: it sits there until the ramp's end.
    return v0 <= 0 ? v0 : v0 * Math.pow(next.v / v0, f);
  }

  private add(event: ParamEvent): FakeAudioParam {
    this.held = null;
    const at = this.events.findIndex((e) => e.t > event.t);
    if (at === -1) this.events.push(event);
    else this.events.splice(at, 0, event);
    return this;
  }

  setValueAtTime(v: number, t: number): FakeAudioParam {
    return this.add({ kind: "set", v, t });
  }
  linearRampToValueAtTime(v: number, t: number): FakeAudioParam {
    return this.add({ kind: "linear", v, t });
  }
  exponentialRampToValueAtTime(v: number, t: number): FakeAudioParam {
    if (v <= 0) throw new RangeError("exponentialRampToValueAtTime: value must be positive");
    return this.add({ kind: "exp", v, t });
  }
  cancelScheduledValues(t: number): FakeAudioParam {
    // The param keeps the level it had reached; only the schedule is forgotten.
    const reached = this.value;
    this.base = reached;
    this.events = this.events.filter((e) => e.t < t);
    this.held = { t: this.clock.currentTime, v: reached };
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
  gain: FakeAudioParam;
  constructor(clock: { currentTime: number }) {
    super();
    this.gain = new FakeAudioParam(clock);
  }
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan: FakeAudioParam;
  constructor(clock: { currentTime: number }) {
    super();
    this.pan = new FakeAudioParam(clock, 0);
  }
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  frequency: FakeAudioParam;
  Q: FakeAudioParam;
  constructor(clock: { currentTime: number }) {
    super();
    this.frequency = new FakeAudioParam(clock, 350);
    this.Q = new FakeAudioParam(clock, 1);
  }
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
  panners: FakeStereoPannerNode[] = [];
  /** Counts IR construction so a test can prove the cache actually caches. */
  buffersCreated = 0;
  private wrapped = new WeakSet<HTMLAudioElement>();

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
    const node = new FakeGainNode(this);
    this.gains.push(node);
    return node;
  }

  createStereoPanner(): FakeStereoPannerNode {
    const node = new FakeStereoPannerNode(this);
    this.panners.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode(this);
    this.filters.push(node);
    return node;
  }

  /** A browser allows this once per element, ever; a second call throws. */
  createMediaElementSource(el: HTMLAudioElement): FakeMediaElementSource {
    if (this.wrapped.has(el)) throw new DOMException("already connected", "InvalidStateError");
    this.wrapped.add(el);
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
  vi.doMock("@/lib/audio/audioContext", () => ({
    getAudioContext: () => asAudioContext(ctx),
    primeAudioContext: () => {},
    resumeExistingAudioContext: () => {
      if (ctx?.state === "suspended") void ctx.resume();
    },
  }));
  const mod = await import("@/lib/audio/audioEngine");
  return mod.getAudioEngine();
}

function makeAudioEl(): HTMLAudioElement {
  return document.createElement("audio");
}

/** Every node a signal leaving `from` can reach. */
function reachableFrom(from: FakeAudioNode): Set<FakeAudioNode> {
  const seen = new Set<FakeAudioNode>();
  const walk = (node: FakeAudioNode): void => {
    for (const next of node.connections) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next);
    }
  };
  walk(from);
  return seen;
}

// The engine builds its graph on the first call that touches it: the master gain and filter, the three bus gains,
// the three bus filters, then the reverb return and master send. Attaching a sound adds its filter, gain and
// reverb send. Tests name nodes by that creation order rather than by exporting engine internals.
function graphNodes(ctx: FakeAudioContext) {
  const [master, music, ambient, effects, reverbReturn, masterSend, soundGain, reverbSend] = ctx.gains;
  const [masterFilter, musicFilter, ambientFilter, effectsFilter, soundFilter] = ctx.filters;
  return {
    master, music, ambient, effects, reverbReturn, masterSend, soundGain, reverbSend,
    masterFilter, musicFilter, ambientFilter, effectsFilter, soundFilter,
  };
}

describe("audioEngine", () => {
  describe("routing", () => {
    it("lets a sound reach the speakers through its own bus and the master, and no other bus", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { master, music, ambient, effects, soundFilter, soundGain } = graphNodes(ctx);

      const heard = reachableFrom(ctx.sources[0]);
      expect(heard.has(ctx.destination)).toBe(true);
      // Through its own filter and gain, then the music bus and the master: so every fader on the way works on it.
      for (const node of [soundFilter, soundGain, music, master]) expect(heard.has(node)).toBe(true);
      expect(heard.has(ambient)).toBe(false);
      expect(heard.has(effects)).toBe(false);
    });

    it("feeds a sound into its bus filter, so a bus effect colours everything on that bus", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "ambient");
      const { ambientFilter, musicFilter } = graphNodes(ctx);
      const heard = reachableFrom(ctx.sources[0]);
      expect(heard.has(ambientFilter)).toBe(true);
      expect(heard.has(musicFilter)).toBe(false);
    });

    it("moves a sound to another bus without losing its reverb send or rebuilding its chain", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      const { music, effects, reverbSend } = graphNodes(ctx);

      engine.attach("s1", el, "effects");

      const heard = reachableFrom(ctx.sources[0]);
      expect(ctx.sources).toHaveLength(1);
      expect(heard.has(effects)).toBe(true);
      expect(heard.has(music)).toBe(false);
      // Re-routing must not leave the sound silently dry of its reverb send.
      expect(heard.has(reverbSend)).toBe(true);
    });

    it("sends the reverb tail to the master gain without passing it through the master filter again", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { reverbSend, master, masterFilter } = graphNodes(ctx);
      const [convolver] = ctx.convolvers;

      const tail = reachableFrom(reverbSend);
      expect(tail.has(convolver)).toBe(true);
      expect(tail.has(master)).toBe(true);
      expect(tail.has(masterFilter)).toBe(false);
    });

    it("stops a detached sound reaching the speakers but leaves the shared graph working", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();
      engine.attach("s1", el, "music");
      engine.attach("s2", makeAudioEl(), "music");

      engine.detach("s1");

      expect(reachableFrom(ctx.sources[0]).has(ctx.destination)).toBe(false);
      expect(reachableFrom(ctx.sources[1]).has(ctx.destination)).toBe(true);

      // The element's source node can only ever be created once; re-attaching must reuse it, not throw.
      expect(() => engine.attach("s1", el, "music")).not.toThrow();
      expect(ctx.sources).toHaveLength(2);
      expect(reachableFrom(ctx.sources[0]).has(ctx.destination)).toBe(true);
    });

    it("attach is idempotent per soundId: a second call with the same element builds nothing new", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      const el = makeAudioEl();

      engine.attach("s1", el, "music");
      const nodesAfterFirst = [ctx.sources.length, ctx.filters.length, ctx.gains.length, ctx.panners.length];
      engine.attach("s1", el, "music");

      expect([ctx.sources.length, ctx.filters.length, ctx.gains.length, ctx.panners.length]).toEqual(nodesAfterFirst);
    });

    it("rebuilds the chain when the same soundId arrives with a new element, and drops the stale one", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      engine.attach("s1", makeAudioEl(), "music");

      expect(ctx.sources).toHaveLength(2);
      expect(reachableFrom(ctx.sources[0]).has(ctx.destination)).toBe(false);
      expect(reachableFrom(ctx.sources[1]).has(ctx.destination)).toBe(true);
    });

    it("detach on an unknown soundId is a safe no-op", async () => {
      const engine = await loadEngine(new FakeAudioContext());
      expect(() => engine.detach("nope")).not.toThrow();
    });
  });

  describe("volume", () => {
    it("sets a bus level without touching the other buses", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1); // materialize the graph without attaching a sound
      const { music, ambient } = graphNodes(ctx);

      engine.setBusVolume("music", 0.4, 0);

      expect(music.gain.value).toBeCloseTo(0.4);
      expect(ambient.gain.value).toBe(1);
    });

    it("glides to a new sound volume over the ramp, arriving exactly on time", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.5, 200);

      expect(soundGain.gain.valueAt(0)).toBe(1);
      const mid = soundGain.gain.valueAt(0.1);
      expect(mid).toBeLessThan(1);
      expect(mid).toBeGreaterThan(0.5);
      expect(soundGain.gain.valueAt(0.2)).toBeCloseTo(0.5);
    });

    it("changes volume instantly when no ramp is asked for", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.3);

      expect(soundGain.gain.value).toBeCloseTo(0.3);
    });

    it("clamps a volume above 1 to 1 and below 0 to 0", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 7);
      expect(soundGain.gain.value).toBe(1);
      engine.setSoundVolume("s1", -2);
      expect(soundGain.gain.value).toBe(0);
    });

    it("multiplies trim and volume, whichever is set last", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("a", makeAudioEl(), "music");
      engine.attach("b", makeAudioEl(), "music");
      const [soundGainA, soundGainB] = [ctx.gains[6], ctx.gains[8]];

      engine.setSoundTrim("a", 0.6);
      engine.setSoundVolume("a", 0.5);
      engine.setSoundVolume("b", 0.5);
      engine.setSoundTrim("b", 0.6);

      expect(soundGainA.gain.value).toBeCloseTo(0.3);
      expect(soundGainB.gain.value).toBeCloseTo(0.3);
    });

    it("never lets a trim go negative, and lets it lift a quiet recording above 1", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundTrim("s1", 1.5);
      expect(soundGain.gain.value).toBeCloseTo(1.5);
      engine.setSoundTrim("s1", -1);
      expect(soundGain.gain.value).toBe(0);
    });

    it("starts a new ramp from where the last one had got to, with no jump", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);

      engine.setSoundVolume("s1", 0.2, 1000); // 1 -> 0.2 over a second
      ctx.currentTime = 0.5;
      const midRamp = soundGain.gain.value;
      expect(midRamp).toBeLessThan(1);
      expect(midRamp).toBeGreaterThan(0.2);

      engine.setSoundVolume("s1", 0.8, 1000);

      // At the instant of the change the level has not moved; a second later it has arrived.
      expect(soundGain.gain.value).toBeCloseTo(midRamp, 9);
      // And it is now heading for the new target, not still on its way to the old one.
      expect(soundGain.gain.valueAt(1.0)).toBeGreaterThan(midRamp);
      expect(soundGain.gain.valueAt(1.5)).toBeCloseTo(0.8);
    });
  });

  describe("fadeIn / fadeOut", () => {
    it("fades out to exact silence, which a naive exponential ramp could never reach", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);
      engine.setSoundVolume("s1", 1);

      await engine.fadeOut("s1", 100);

      expect(soundGain.gain.valueAt(0.1)).toBe(0);
      expect(soundGain.gain.valueAt(0.05)).toBeCloseTo(0.5);
    });

    it("fadeOut's promise resolves only after the ramp duration elapses", async () => {
      vi.useFakeTimers();
      try {
        const ctx = new FakeAudioContext();
        const engine = await loadEngine(ctx);
        engine.attach("s1", makeAudioEl(), "music");

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

    it("fades in from true silence back up to the sound's configured volume", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      engine.setSoundVolume("s1", 0.7);
      engine.setSoundTrim("s1", 0.5);
      await engine.fadeOut("s1", 0);
      const { soundGain } = graphNodes(ctx);
      expect(soundGain.gain.value).toBe(0);

      engine.fadeIn("s1", 150);

      // It has to leave zero straight away (an exponential ramp from 0 would sit there until the end), and arrive
      // at volume times trim, 0.35, the level the sound would otherwise be playing at.
      expect(soundGain.gain.valueAt(0.075)).toBeGreaterThan(0.1);
      expect(soundGain.gain.valueAt(0.15)).toBeCloseTo(0.35);
    });
  });

  describe("ducking", () => {
    it("ducks music and ambient to a quarter, leaves effects alone, and unduck restores them", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music, ambient, effects } = graphNodes(ctx);
      engine.setBusVolume("music", 0.8, 0);
      engine.setBusVolume("ambient", 0.6, 0);

      engine.duck(0);

      expect(music.gain.value).toBeCloseTo(0.2);
      expect(ambient.gain.value).toBeCloseTo(0.15);
      expect(effects.gain.value).toBe(1);

      engine.unduck(0);

      expect(music.gain.value).toBeCloseTo(0.8);
      expect(ambient.gain.value).toBeCloseTo(0.6);
    });

    it("ducking twice does not compound: one unduck returns to the original level", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);

      engine.duck(0);
      engine.duck(0);
      expect(music.gain.value).toBeCloseTo(0.25);
      engine.unduck(0);

      expect(music.gain.value).toBeCloseTo(1);
    });

    it("ducks from the levels the buses have now, not from the levels before an earlier duck", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);
      engine.duck(0);
      engine.unduck(0);
      engine.setBusVolume("music", 0.5, 0);

      engine.duck(0);

      expect(music.gain.value).toBeCloseTo(0.125);
    });

    it("a duck depth above 1 never boosts a bus", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);
      engine.setBusVolume("music", 0.6, 0);

      engine.duck(0, 5);

      expect(music.gain.value).toBeCloseTo(0.6);
    });

    it("unduck with nothing ducked changes nothing", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);
      engine.setBusVolume("music", 0.5, 0);

      engine.unduck(0);

      expect(music.gain.value).toBeCloseTo(0.5);
    });

    it("duck depth is configurable via its second argument", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.setMasterVolume(1);
      const { music } = graphNodes(ctx);

      engine.duck(0, 0.1);

      expect(music.gain.value).toBeCloseTo(0.1);
    });
  });

  describe("effect presets", () => {
    it("muffles a sound behind a wall more than behind a door, and makes both quieter", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "effects");
      const { soundGain, soundFilter } = graphNodes(ctx);
      const open = soundFilter.frequency.value;

      engine.setEffect("s1", "through_door", 0);
      const doorCutoff = soundFilter.frequency.value;
      const doorGain = soundGain.gain.value;
      engine.setEffect("s1", "through_wall", 0);
      const wallCutoff = soundFilter.frequency.value;
      const wallGain = soundGain.gain.value;

      expect(wallCutoff).toBeLessThan(doorCutoff);
      expect(doorCutoff).toBeLessThan(open);
      expect(wallGain).toBeLessThan(doorGain);
      expect(doorGain).toBeLessThan(1);
    });

    it("reaches its filter settings by the end of the ramp, gradually on the way", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "effects");
      const { soundFilter } = graphNodes(ctx);
      const open = soundFilter.frequency.value;

      engine.setEffect("s1", "cave", 100);
      const target = soundFilter.frequency.valueAt(0.1);

      expect(target).toBeLessThan(open);
      const mid = soundFilter.frequency.valueAt(0.05);
      expect(mid).toBeLessThan(open);
      expect(mid).toBeGreaterThan(target);
    });

    it("'none' puts the filter, resonance and level back exactly as they were before any effect", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundFilter, soundGain } = graphNodes(ctx);
      const before = { f: soundFilter.frequency.value, q: soundFilter.Q.value, g: soundGain.gain.value };
      engine.setEffect("s1", "cave", 50);
      expect(soundFilter.frequency.valueAt(0.05)).not.toBe(before.f);

      engine.setEffect("s1", "none", 50);

      expect(soundFilter.frequency.valueAt(0.1)).toBeCloseTo(before.f);
      expect(soundFilter.Q.valueAt(0.1)).toBeCloseTo(before.q);
      expect(soundGain.gain.valueAt(0.1)).toBeCloseTo(before.g);
    });

    it("composes with a previously-set volume and trim rather than overwriting them", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundGain } = graphNodes(ctx);
      engine.setSoundVolume("s1", 0.8);
      engine.setSoundTrim("s1", 0.5);
      const plain = soundGain.gain.value; // 0.4

      engine.setEffect("s1", "through_door", 0);
      const behindDoor = soundGain.gain.value;
      engine.setEffect("s1", "none", 0);

      expect(plain).toBeCloseTo(0.4);
      expect(behindDoor).toBeGreaterThan(0);
      expect(behindDoor).toBeLessThan(plain);
      expect(soundGain.gain.value).toBeCloseTo(plain);
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
    it("is available when a context exists", async () => {
      const engine = await loadEngine(new FakeAudioContext());
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
      expect(() => engine.setBusEffect("music", "cave", 0)).not.toThrow();
      expect(() => engine.setMasterEffect("cave", 0)).not.toThrow();
      expect(() => engine.setPan("s1", 0.5)).not.toThrow();
      expect(() => engine.resume()).not.toThrow();
    });

    it("direct mode is available even where Web Audio is not", async () => {
      const engine = await loadEngine(null);
      expect(engine.available).toBe(false);
      engine.setDirectMode(true);
      expect(engine.available).toBe(true);
    });

    it("entering direct mode silences the graph chains it leaves behind", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      expect(reachableFrom(ctx.sources[0]).has(ctx.destination)).toBe(true);

      engine.setDirectMode(true);

      expect(reachableFrom(ctx.sources[0]).has(ctx.destination)).toBe(false);
    });

    it("direct mode stays available without Web Audio and never builds the graph", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);

      engine.setDirectMode(true);
      engine.attach("s1", makeAudioEl(), "music");

      expect(engine.directMode).toBe(true);
      expect(engine.available).toBe(true);
      expect(ctx.sources).toHaveLength(0);
      expect(ctx.gains).toHaveLength(0);
    });
  });

  describe("stereo pan", () => {
    it("places a sound in the stereo field, clamped to hard left and hard right", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "effects");
      const [panner] = ctx.panners;

      engine.setPan("s1", 0.4);
      expect(panner.pan.value).toBeCloseTo(0.4);
      engine.setPan("s1", -3);
      expect(panner.pan.value).toBe(-1);
      engine.setPan("s1", 9);
      expect(panner.pan.value).toBe(1);
    });

    it("ignores a pan for a sound that is not attached", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "effects");

      expect(() => engine.setPan("ghost", 1)).not.toThrow();
      expect(ctx.panners[0].pan.value).toBe(0);
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

      // A closed door is not a space: it blocks sound, it doesn't reverberate.
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

    it("gives a longer tail to a cave than to a sewer, switching the shared convolver to match", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const [convolver] = ctx.convolvers;
      const start = convolver.buffer;

      engine.setEffect("s1", "cave", 0);
      const caveTail = convolver.buffer?.length ?? 0;
      engine.setEffect("s1", "sewer", 0);
      const sewerTail = convolver.buffer?.length ?? 0;

      expect(caveTail).toBeGreaterThan(sewerTail);
      expect(sewerTail).toBeGreaterThan(0);
      expect(convolver.buffer === start).toBe(false); // (not toBe: a failing diff of two audio buffers takes minutes to print)
    });

    it("leaves the tail alone when an effect is cleared, so a fading send does not change its tail mid-fade", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const [convolver] = ctx.convolvers;

      engine.setEffect("s1", "cave", 0);
      const caveTail = convolver.buffer;
      engine.setEffect("s1", "none", 500);
      expect(convolver.buffer === caveTail).toBe(true);

      engine.setMasterEffect("sewer", 0);
      const sewerTail = convolver.buffer;
      engine.setMasterEffect("none", 500);
      expect(convolver.buffer === sewerTail).toBe(true);
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
      const open = ambientFilter.frequency.value;

      engine.setBusEffect("music", "underwater", 0);

      expect(musicFilter.frequency.value).toBeLessThan(open);
      expect(ambientFilter.frequency.value).toBe(open);
    });

    it("a master effect colours the whole mix and sends it into the shared reverb", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { masterFilter, masterSend } = graphNodes(ctx);
      const open = masterFilter.frequency.value;

      // The party walks into a cave, so everything audible is in the cave, not just whichever track was selected.
      engine.setMasterEffect("cave", 0);

      expect(masterFilter.frequency.value).toBeLessThan(open);
      expect(masterSend.gain.value).toBeGreaterThan(0.4);
    });

    it("sound, bus and master effects each keep their own filter rather than clobbering each other", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundFilter, musicFilter, masterFilter } = graphNodes(ctx);
      const open = masterFilter.frequency.value;

      engine.setEffect("s1", "through_door", 0);
      engine.setBusEffect("music", "distant", 0);
      engine.setMasterEffect("cave", 0);

      // A bard behind a door, heard from across the room, in a cave: three different cutoffs, all below open.
      const cutoffs = [soundFilter, musicFilter, masterFilter].map((f) => f.frequency.value);
      expect(cutoffs.every((c) => c < open)).toBe(true);
      expect(new Set(cutoffs).size).toBe(3);
    });

    it("clearing the master effect leaves sound-level effects alone", async () => {
      const ctx = new FakeAudioContext();
      const engine = await loadEngine(ctx);
      engine.attach("s1", makeAudioEl(), "music");
      const { soundFilter, masterFilter, masterSend } = graphNodes(ctx);
      const open = masterFilter.frequency.value;

      engine.setEffect("s1", "through_door", 0);
      const behindDoor = soundFilter.frequency.value;
      engine.setMasterEffect("cave", 0);
      engine.setMasterEffect("none", 0);

      expect(masterFilter.frequency.value).toBe(open);
      expect(masterSend.gain.value).toBe(0);
      expect(soundFilter.frequency.value).toBe(behindDoor);
    });
  });
});
