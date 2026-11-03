import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import type { DeckAction, DeckCellView, DeckSnapshot } from "@/lib/audio/deck/deckSurface";
import type { MidiAccessLike, MidiInputLike, MidiOutputLike } from "@/lib/audio/deck/midi/midiAccess";
import { BINDINGS_STORAGE_KEY } from "@/lib/audio/deck/midi/midiLearn";
import { LIGHTS_STORAGE_KEY, TAP_MS, useDeckMidi } from "./useDeckMidi";

function snap(over: Partial<DeckSnapshot> = {}): DeckSnapshot {
  return {
    pages: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    pageIndex: 0,
    lanes: [],
    rows: 1,
    keyRow: 0,
    cells: [],
    tool: "play",
    lockedTool: "play",
    hush: false,
    paused: false,
    audibleCount: 0,
    masterVolume: 1,
    ...over,
  };
}

function cellAt(light: DeckCellView["light"]): DeckCellView {
  return { lane: 0, row: 0, padId: "p", kind: "sound", category: "music", light } as DeckCellView;
}

interface Rig {
  actions: DeckAction[];
  snapshot: ReturnType<typeof ref<DeckSnapshot>>;
  sent: number[][];
  lp: MidiInputLike;
  keys: MidiInputLike;
  access: MidiAccessLike;
  midi: ReturnType<typeof useDeckMidi>;
  store: Map<string, string>;
  press: (data: number[]) => void;
  pressKeys: (data: number[]) => void;
}

function rig(opts: { lpName?: string; supported?: boolean; store?: Map<string, string> } = {}): Rig {
  const actions: DeckAction[] = [];
  const snapshot = ref<DeckSnapshot>(snap());
  const sent: number[][] = [];
  const name = opts.lpName ?? "LPProMK3 MIDI";
  const lp: MidiInputLike = { id: "in-lp", name, state: "connected", onmidimessage: null };
  const keys: MidiInputLike = { id: "in-keys", name: "Keystation", state: "connected", onmidimessage: null };
  const out: MidiOutputLike = { id: "out-lp", name, state: "connected", send: (d) => void sent.push([...d]) };
  const access: MidiAccessLike = {
    inputs: { values: () => [lp, keys] },
    outputs: { values: () => [out] },
    onstatechange: null,
  };
  const store = opts.store ?? new Map<string, string>();
  const midi = useDeckMidi(
    { dispatch: (a) => void actions.push(a), snapshot },
    {
      navigator: opts.supported === false ? {} : { requestMIDIAccess: async () => access },
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    },
  );
  return {
    actions,
    snapshot,
    sent,
    lp,
    keys,
    access,
    midi,
    store,
    press: (data) => lp.onmidimessage?.({ data: Uint8Array.from(data) }),
    pressKeys: (data) => keys.onmidimessage?.({ data: Uint8Array.from(data) }),
  };
}

const PROGRAMMER_ON = [0xf0, 0, 0x20, 0x29, 2, 0x0e, 0x0e, 1, 0xf7];
const LIVE = [0xf0, 0, 0x20, 0x29, 2, 0x0e, 0x0e, 0, 0xf7];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("support", () => {
  it("is unsupported, and connect does nothing and does not throw, without Web MIDI", async () => {
    const r = rig({ supported: false });
    expect(r.midi.support.value).toBe("unsupported");
    await r.midi.connect();
    expect(r.midi.support.value).toBe("unsupported");
  });

  it("goes idle to granted on connect", async () => {
    const r = rig();
    expect(r.midi.support.value).toBe("idle");
    await r.midi.connect();
    expect(r.midi.support.value).toBe("granted");
    expect(r.midi.launchpads.value.map((l) => l.label)).toEqual(["Launchpad Pro MK3"]);
    expect(r.midi.otherInputs.value.map((i) => i.name)).toEqual(["Keystation"]);
  });
});

describe("connecting a Launchpad", () => {
  it("enters Programmer mode first, then sends one full frame", async () => {
    const r = rig();
    await r.midi.connect();
    expect(r.sent[0]).toEqual(PROGRAMMER_ON);
    const frame = r.sent.slice(1);
    // 64 pads + 8 top + 8 right + 3 Pro extras = 83 specs
    expect(frame.length).toBe(1);
    expect(frame[0][6]).toBe(0x03);
  });

  it("sends only what changed when the snapshot changes", async () => {
    const r = rig();
    await r.midi.connect();
    r.sent.length = 0;
    r.snapshot.value = snap({ cells: [cellAt("playing")] });
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    // header(7) + one rgb spec(5) + F7
    expect(r.sent[0]).toHaveLength(7 + 5 + 1);
    expect(r.sent[0].slice(7, 9)).toEqual([3, 81]);
  });

  it("sends no lights while lights are off, a full frame when turned back on, and remembers the choice", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.setLightsEnabled(false);
    expect(r.store.get(LIGHTS_STORAGE_KEY)).toBe("0");
    r.sent.length = 0;
    r.snapshot.value = snap({ hush: true });
    await Promise.resolve();
    expect(r.sent).toEqual([]);
    r.midi.setLightsEnabled(true);
    expect(r.sent).toHaveLength(1);
  });

  it("reads lights off from storage", () => {
    const r = rig({ store: new Map([[LIGHTS_STORAGE_KEY, "0"]]) });
    expect(r.midi.lightsEnabled.value).toBe(false);
  });
});

describe("Launchpad pads and page buttons", () => {
  it("presses with velocity and releases; the Mini sends none because its velocity is fixed", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0x90, 81, 127]);
    r.press([0x90, 81, 0]);
    expect(r.actions).toEqual([
      { type: "press", lane: 0, row: 0, velocity: 1 },
      { type: "release", lane: 0, row: 0 },
    ]);

    const m = rig({ lpName: "LPMiniMK3 MIDI" });
    await m.midi.connect();
    m.press([0x90, 18, 127]);
    expect(m.actions).toEqual([{ type: "press", lane: 7, row: 7 }]);
  });

  it("switches to an existing page, and does nothing for a page that does not exist", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 92, 127]);
    r.press([0xb0, 95, 127]);
    r.press([0xb0, 92, 0]);
    expect(r.actions).toEqual([{ type: "page", index: 1 }]);
  });

  it("maps the Pro's left column and the plain right-hand buttons", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 80, 127]);
    r.press([0xb0, 70, 127]);
    r.press([0xb0, 10, 127]);
    r.press([0xb0, 19, 127]);
    expect(r.actions).toEqual([
      { type: "pageStep", delta: -1 },
      { type: "pageStep", delta: 1 },
      { type: "stopAll" },
      { type: "fadeAll" },
    ]);
  });
});

describe("a Launchpad X, its buttons matched to their printed labels", () => {
  const tap = (r: Rig, cc: number) => {
    r.press([0xb0, cc, 127]);
    r.press([0xb0, cc, 0]);
  };

  it("Session unlocks a tapped tool; without it a locked tool had no way out on the device", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    await r.midi.connect();
    tap(r, 95);
    expect(r.actions).toEqual([{ type: "tool", tool: "play", phase: "toggle" }]);
  });

  it("maps Volume, Pan, Send A, Stop Clip, Mute, Solo and Record Arm, and leaves Send B dark", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    await r.midi.connect();
    const firstOf = (cc: number) => {
      r.actions.length = 0;
      tap(r, cc);
      return r.actions[0];
    };
    expect(firstOf(89)).toEqual({ type: "tool", tool: "volume", phase: "down" });
    expect(firstOf(79)).toEqual({ type: "tool", tool: "fade", phase: "down" });
    expect(firstOf(69)).toEqual({ type: "fadeAll" });
    expect(firstOf(59)).toBeUndefined();
    expect(firstOf(49)).toEqual({ type: "tool", tool: "stop", phase: "down" });
    expect(firstOf(39)).toEqual({ type: "hush", phase: "down" });
    expect(firstOf(29)).toEqual({ type: "tool", tool: "solo", phase: "down" });
    expect(firstOf(19)).toEqual({ type: "tool", tool: "edit", phase: "down" });
  });

  it("steps pages with left and right, and gives Note, Custom and Capture MIDI Loop, Pause all and Stop all", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    await r.midi.connect();
    tap(r, 93);
    tap(r, 94);
    tap(r, 97);
    tap(r, 98);
    tap(r, 96);
    expect(r.actions.slice(0, 4)).toEqual([
      { type: "pageStep", delta: -1 },
      { type: "pageStep", delta: 1 },
      { type: "pauseAll" },
      { type: "stopAll" },
    ]);
    expect(r.actions[4]).toEqual({ type: "tool", tool: "loop", phase: "down" });
  });

  it("scrolls the grid one row per arrow, so a pad plays the row it shows, never past the last", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    r.snapshot.value = snap({ rows: 10 });
    await r.midi.connect();
    tap(r, 92);
    r.press([0x90, 81, 100]);
    expect(r.actions.at(-1)).toMatchObject({ type: "press", lane: 0, row: 1 });
    for (let i = 0; i < 5; i++) tap(r, 92);
    r.press([0x90, 82, 100]);
    expect(r.actions.at(-1)).toMatchObject({ type: "press", lane: 1, row: 2 });
    tap(r, 91);
    r.press([0x90, 83, 100]);
    expect(r.actions.at(-1)).toMatchObject({ type: "press", lane: 2, row: 1 });
  });

  it("plays what the device shows after the page loses rows under a scrolled grid", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    r.snapshot.value = snap({ rows: 10 });
    await r.midi.connect();
    tap(r, 92);
    tap(r, 92);
    // A pad below row 8 was cleared: the page is eight rows again and cannot scroll.
    r.snapshot.value = snap({ rows: 8 });
    await Promise.resolve();
    r.press([0x90, 81, 100]);
    expect(r.actions.at(-1)).toMatchObject({ type: "press", lane: 0, row: 0 });
  });

  it("lights the scrolled rows, and starts another page at its top row", async () => {
    const r = rig({ lpName: "LPX MIDI" });
    const cell = { ...cellAt("playing"), row: 1 };
    r.snapshot.value = snap({ rows: 10, cells: [cell] });
    await r.midi.connect();
    tap(r, 92);
    // Row 1 now sits on the device's top row: note 81, full gold.
    expect(`,${r.sent.at(-1)?.join(",")},`).toContain(",3,81,127,75,0,");
    r.press([0x90, 81, 100]);
    r.press([0x90, 81, 0]);
    r.snapshot.value = snap({ rows: 10, cells: [cell], pageIndex: 1 });
    await Promise.resolve();
    r.press([0x90, 81, 100]);
    expect(r.actions.at(-1)).toMatchObject({ type: "press", lane: 0, row: 0 });
  });
});

describe("tool buttons: tap locks, hold borrows", () => {
  it("sends down then up then toggle for a quick tap", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 89, 127]);
    vi.advanceTimersByTime(TAP_MS - 50);
    r.press([0xb0, 89, 0]);
    expect(r.actions).toEqual([
      { type: "tool", tool: "loop", phase: "down" },
      { type: "tool", tool: "loop", phase: "up" },
      { type: "tool", tool: "loop", phase: "toggle" },
    ]);
  });

  it("sends only down and up for a hold of 250ms; a toggle here would lock a borrowed tool", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 79, 127]);
    vi.advanceTimersByTime(TAP_MS);
    r.press([0xb0, 79, 0]);
    expect(r.actions.map((a) => (a.type === "tool" ? a.phase : a.type))).toEqual(["down", "up"]);
  });

  it("treats a press of a pad while held as a hold, however quick", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 79, 127]);
    r.press([0x90, 81, 100]);
    r.press([0x90, 81, 0]);
    r.press([0xb0, 79, 0]);
    expect(r.actions.filter((a) => a.type === "tool").map((a) => (a as { phase: string }).phase)).toEqual([
      "down",
      "up",
    ]);
  });

  it("gives hush the same rule", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0xb0, 29, 127]);
    r.press([0xb0, 29, 0]);
    expect(r.actions).toEqual([
      { type: "hush", phase: "down" },
      { type: "hush", phase: "up" },
      { type: "hush", phase: "toggle" },
    ]);
  });
});

describe("letting go", () => {
  it("releases held pads and tools and returns to Live mode on disconnect, so nothing sticks", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0x90, 82, 100]);
    r.press([0xb0, 79, 127]);
    r.actions.length = 0;
    r.sent.length = 0;
    r.midi.disconnect();
    expect(r.actions).toContainEqual({ type: "release", lane: 1, row: 0 });
    expect(r.actions).toContainEqual({ type: "tool", tool: "stop", phase: "up" });
    expect(r.actions.some((a) => a.type === "tool" && a.phase === "toggle")).toBe(false);
    expect(r.sent).toContainEqual(LIVE);
    expect(r.lp.onmidimessage).toBeNull();
  });

  it("releases held pads, and sends nothing to a gone device, when it is unplugged", async () => {
    const r = rig();
    await r.midi.connect();
    r.press([0x90, 82, 100]);
    r.actions.length = 0;
    r.sent.length = 0;
    r.lp.state = "disconnected";
    r.access.onstatechange?.({});
    expect(r.actions).toEqual([{ type: "release", lane: 1, row: 0 }]);
    expect(r.sent).toEqual([]);
    expect(r.midi.launchpads.value).toEqual([]);
  });

  it("does the same when the owning scope is disposed", async () => {
    const scope = effectScope();
    let r!: Rig;
    scope.run(() => {
      r = rig();
    });
    await r.midi.connect();
    r.press([0x90, 82, 100]);
    scope.stop();
    expect(r.actions).toContainEqual({ type: "release", lane: 1, row: 0 });
    expect(r.sent).toContainEqual(LIVE);
  });
});

describe("MIDI Learn", () => {
  it("binds the next note to a pad, persists it, and then plays that pad", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.beginLearn({ type: "pad", lane: 3, row: 2 });
    expect(r.midi.learning.value).not.toBeNull();
    r.pressKeys([0x90, 60, 100]);
    expect(r.midi.learning.value).toBeNull();
    expect(r.actions).toEqual([]);
    expect(r.store.get(BINDINGS_STORAGE_KEY)).toContain('"number":60');

    r.pressKeys([0x90, 60, 127]);
    r.pressKeys([0x80, 60, 0]);
    expect(r.actions).toEqual([
      { type: "press", lane: 3, row: 2, velocity: 1 },
      { type: "release", lane: 3, row: 2 },
    ]);
  });

  it("rebinding a target moves it instead of leaving the old key live", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.beginLearn({ type: "stopAll" });
    r.pressKeys([0x90, 60, 100]);
    r.midi.beginLearn({ type: "stopAll" });
    r.pressKeys([0x90, 61, 100]);
    expect(r.midi.bindings.value).toHaveLength(1);
    r.pressKeys([0x90, 60, 100]);
    expect(r.actions).toEqual([]);
    r.pressKeys([0x90, 61, 100]);
    expect(r.actions).toEqual([{ type: "stopAll" }]);
  });

  it("sends a bound knob's value continuously as 0 to 1", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.beginLearn({ type: "master" });
    r.pressKeys([0xb0, 7, 10]);
    r.pressKeys([0xb0, 7, 127]);
    r.pressKeys([0xb0, 7, 0]);
    expect(r.actions).toEqual([
      { type: "master", value: 1 },
      { type: "master", value: 0 },
    ]);
  });

  it("releases a learned pad that is still held when the controller is unplugged", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.beginLearn({ type: "pad", lane: 0, row: 0 });
    r.pressKeys([0xb0, 20, 100]);
    r.pressKeys([0xb0, 20, 90]);
    r.actions.length = 0;
    r.keys.state = "disconnected";
    r.access.onstatechange?.({});
    expect(r.actions).toEqual([{ type: "release", lane: 0, row: 0 }]);
  });

  it("cancel stops learning, and removing a binding forgets it", async () => {
    const r = rig();
    await r.midi.connect();
    r.midi.beginLearn({ type: "hush" });
    r.midi.cancelLearn();
    r.pressKeys([0x90, 60, 100]);
    expect(r.midi.bindings.value).toEqual([]);
    r.midi.beginLearn({ type: "fadeAll" });
    r.pressKeys([0x90, 60, 100]);
    const [b] = r.midi.bindings.value;
    r.midi.removeBinding(b);
    expect(r.midi.bindings.value).toEqual([]);
    r.pressKeys([0x90, 60, 100]);
    expect(r.actions).toEqual([]);
  });

  it("loads saved bindings and ignores a corrupted store", () => {
    const bad = rig({ store: new Map([[BINDINGS_STORAGE_KEY, "{{{"]]) });
    expect(bad.midi.bindings.value).toEqual([]);
  });
});
