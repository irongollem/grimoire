import { describe, expect, it } from "vitest";
import {
  findLaunchpads,
  findOtherInputs,
  type MidiAccessLike,
  type MidiInputLike,
  type MidiOutputLike,
  requestMidi,
  watchMidiState,
} from "./midiAccess";

function input(id: string, name: string, state: "connected" | "disconnected" = "connected"): MidiInputLike {
  return { id, name, state, onmidimessage: null };
}
function output(id: string, name: string): MidiOutputLike {
  return { id, name, state: "connected", send: () => {} };
}
function access(inputs: MidiInputLike[], outputs: MidiOutputLike[]): MidiAccessLike {
  return { inputs: { values: () => inputs }, outputs: { values: () => outputs }, onstatechange: null };
}

describe("requestMidi", () => {
  it("reports unsupported, without throwing, where Web MIDI is missing (Safari)", async () => {
    expect(await requestMidi({})).toEqual({ status: "unsupported" });
    expect(await requestMidi(null)).toEqual({ status: "unsupported" });
  });

  it("asks with sysex and reports a refusal as denied", async () => {
    let asked: unknown;
    const a = access([], []);
    expect(
      await requestMidi({
        requestMIDIAccess: async (o) => {
          asked = o;
          return a;
        },
      }),
    ).toEqual({ status: "granted", access: a });
    expect(asked).toEqual({ sysex: true });
    const denied = await requestMidi({
      requestMIDIAccess: async () => {
        throw new Error("SecurityError");
      },
    });
    expect(denied).toEqual({ status: "denied", error: "SecurityError" });
  });
});

describe("finding devices", () => {
  const a = access(
    [
      input("i1", "MIDIIN2 (LPProMK3 MIDI)"),
      input("i2", "LPProMK3 DIN"),
      input("i3", "Keystation 49"),
      input("i4", "LPMiniMK3 MIDI", "disconnected"),
    ],
    [output("o1", "MIDIOUT2 (LPProMK3 MIDI)"), output("o2", "LPProMK3 DIN")],
  );

  it("picks the MIDI port by substring (wrapped Windows names too) and its matching output", () => {
    const found = findLaunchpads(a);
    expect(found).toHaveLength(1);
    expect(found[0].profile.id).toBe("pro3");
    expect(found[0].output.id).toBe("o1");
  });

  it("skips a disconnected Launchpad, and one with no output to light", () => {
    expect(findLaunchpads(access([input("i", "LPX MIDI")], []))).toEqual([]);
    expect(findLaunchpads(access([input("i", "LPMiniMK3 MIDI", "disconnected")], [output("o", "LPMiniMK3 MIDI")]))).toEqual([]);
  });

  it("offers Learn only non-Launchpad inputs, not the Pro's DIN and DAW ports", () => {
    expect(findOtherInputs(a).map((i) => i.id)).toEqual(["i3"]);
  });

  it("subscribes to plug and unplug and can unsubscribe", () => {
    const acc = access([], []);
    const calls: number[] = [];
    const stop = watchMidiState(acc, () => calls.push(1));
    acc.onstatechange?.({});
    stop();
    expect(acc.onstatechange).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
