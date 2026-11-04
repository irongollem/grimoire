import { describe, expect, it } from "vitest";
import {
  BINDINGS_STORAGE_KEY,
  bindTarget,
  findBinding,
  learnStep,
  loadBindings,
  type MidiBinding,
  parseBindings,
  parseIncoming,
  resolveBound,
  saveBindings,
  serializeBindings,
} from "./midiLearn";

const note = (number: number, value: number, channel = 0) => ({ kind: "note" as const, channel, number, value });
const cc = (number: number, value: number, channel = 0) => ({ kind: "cc" as const, channel, number, value });

describe("parseIncoming", () => {
  it("reads note on, note off (as value 0) and CC, with the channel", () => {
    expect(parseIncoming([0x92, 60, 100])).toEqual({ kind: "note", channel: 2, number: 60, value: 100 });
    expect(parseIncoming([0x80, 60, 64])).toEqual({ kind: "note", channel: 0, number: 60, value: 0 });
    expect(parseIncoming([0xb1, 7, 90])).toEqual({ kind: "cc", channel: 1, number: 7, value: 90 });
    expect(parseIncoming([0xf8])).toBeNull();
  });
});

describe("bindings storage", () => {
  const good: MidiBinding = {
    deviceName: "Keys",
    kind: "note",
    channel: 0,
    number: 60,
    target: { type: "pad", lane: 1, row: 2 },
  };

  it("round-trips", () => {
    expect(parseBindings(serializeBindings([good]))).toEqual([good]);
  });

  it("returns an empty list for garbage rather than throwing", () => {
    for (const raw of [null, "", "{nope", "42", "null", '{"bindings":5}', '"x"']) expect(parseBindings(raw)).toEqual([]);
  });

  it("drops an entry of the wrong shape and keeps its good neighbours", () => {
    const raw = JSON.stringify({
      bindings: [
        good,
        { ...good, channel: 16 },
        { ...good, target: { type: "pad", lane: 9, row: 0 } },
        { ...good, target: { type: "tool", tool: "nonsense" } },
        { ...good, deviceName: "" },
        { ...good, kind: "note", target: { type: "master" } },
        "junk",
      ],
    });
    expect(parseBindings(raw)).toEqual([good]);
  });

  it("survives storage that throws on read and on write", () => {
    const boom = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadBindings(boom)).toEqual([]);
    expect(() => saveBindings(boom, [good])).not.toThrow();
    expect(loadBindings(null)).toEqual([]);
  });

  it("writes under the versioned key", () => {
    const store = new Map<string, string>();
    saveBindings({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }, [good]);
    expect(store.has(BINDINGS_STORAGE_KEY)).toBe(true);
  });
});

describe("binding and learning", () => {
  it("replaces an old binding on the same message and an old binding of the same target", () => {
    let list = bindTarget([], "Keys", note(60, 100), { type: "pad", lane: 0, row: 0 });
    list = bindTarget(list, "Keys", note(60, 100), { type: "hush" });
    expect(list).toHaveLength(1);
    expect(list[0].target).toEqual({ type: "hush" });
    list = bindTarget(list, "Keys", note(61, 100), { type: "hush" });
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(61);
  });

  it("keeps the same note on a different device as a separate binding", () => {
    let list = bindTarget([], "A", note(60, 1), { type: "hush" });
    list = bindTarget(list, "B", note(60, 1), { type: "stopAll" });
    expect(list).toHaveLength(2);
    expect(findBinding(list, "B", note(60, 1))?.target).toEqual({ type: "stopAll" });
  });

  it("binds on the next note-on, consuming it so the learned press does not also fire", () => {
    const r = learnStep({ type: "stopAll" }, [], "Keys", note(60, 90));
    expect(r.consumed).toBe(true);
    expect(r.learning).toBeNull();
    expect(r.bindings).toHaveLength(1);
  });

  it("ignores a note-off and a CC at zero while learning; binding on release would bind twice", () => {
    expect(learnStep({ type: "hush" }, [], "K", note(60, 0)).consumed).toBe(false);
    expect(learnStep({ type: "hush" }, [], "K", cc(1, 0)).learning).toEqual({ type: "hush" });
  });

  it("does nothing when not learning", () => {
    expect(learnStep(null, [], "K", note(60, 90)).consumed).toBe(false);
  });

  it("will not bind a knob target to a button; it keeps waiting for a CC", () => {
    const r = learnStep({ type: "master" }, [], "K", note(60, 90));
    expect(r.bindings).toHaveLength(0);
    expect(r.learning).toEqual({ type: "master" });
    expect(learnStep({ type: "master" }, [], "K", cc(7, 50)).bindings).toHaveLength(1);
  });

  it("maps a note's velocity to a level and leaves a CC without one", () => {
    const n = bindTarget([], "K", note(60, 1), { type: "pad", lane: 0, row: 0 })[0];
    expect(resolveBound(n, note(60, 127))).toMatchObject({ down: true, velocity: 1 });
    expect(resolveBound(n, note(60, 0))).toMatchObject({ down: false });
    const c = bindTarget([], "K", cc(7, 1), { type: "master" })[0];
    expect(resolveBound(c, cc(7, 127))).toEqual({ target: { type: "master" }, down: true, level: 1 });
  });
});
