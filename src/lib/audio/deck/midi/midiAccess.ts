/**
 * A thin, feature-detected wrapper over Web MIDI (#1136). Safari has no Web
 * MIDI at all, and a denied or failed request must read as a state, never a
 * throw. The browser objects are typed by minimal interfaces so tests can
 * hand in plain fakes.
 */

import { isLaunchpadFamilyPort, type LaunchpadProfile, profileForPort } from "./launchpadProfiles";

export interface MidiMessageEventLike {
  data: Uint8Array | null;
}

export interface MidiPortLike {
  id: string;
  name: string | null;
  state: "connected" | "disconnected";
}

export interface MidiInputLike extends MidiPortLike {
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}

export interface MidiOutputLike extends MidiPortLike {
  send(data: number[]): void;
}

export interface MidiAccessLike {
  inputs: { values(): Iterable<MidiInputLike> };
  outputs: { values(): Iterable<MidiOutputLike> };
  onstatechange: ((event: unknown) => void) | null;
}

export interface NavigatorLike {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<unknown>;
}

export type MidiRequestResult =
  | { status: "unsupported" }
  | { status: "denied"; error: string }
  | { status: "granted"; access: MidiAccessLike };

/** Asks for MIDI with SysEx. Call from a user action: browsers prompt only then. */
export async function requestMidi(nav: NavigatorLike | null): Promise<MidiRequestResult> {
  if (!nav || typeof nav.requestMIDIAccess !== "function") return { status: "unsupported" };
  try {
    const access = await nav.requestMIDIAccess({ sysex: true });
    // The DOM's MIDIAccess is structurally what MidiAccessLike names.
    return { status: "granted", access: access as MidiAccessLike };
  } catch (e) {
    return { status: "denied", error: e instanceof Error ? e.message : String(e) };
  }
}

export interface FoundLaunchpad {
  profile: LaunchpadProfile;
  input: MidiInputLike;
  output: MidiOutputLike;
}

function connected<T extends MidiPortLike>(ports: Iterable<T>): T[] {
  return [...ports].filter((p) => p.state === "connected");
}

/** A Launchpad needs both its input and its lighting output to be driven. */
export function findLaunchpads(access: MidiAccessLike): FoundLaunchpad[] {
  const outputs = connected(access.outputs.values());
  const found: FoundLaunchpad[] = [];
  for (const input of connected(access.inputs.values())) {
    const profile = profileForPort(input.name);
    if (!profile) continue;
    const needle = profile.portSubstring.toLowerCase();
    const output = outputs.find((o) => o.name !== null && o.name.toLowerCase().includes(needle));
    if (output) found.push({ profile, input, output });
  }
  return found;
}

/** Inputs for Learn: everything connected that is not a Launchpad port. */
export function findOtherInputs(access: MidiAccessLike): MidiInputLike[] {
  return connected(access.inputs.values()).filter((i) => !isLaunchpadFamilyPort(i.name));
}

/** Calls back on plug and unplug. Returns the unsubscribe. */
export function watchMidiState(access: MidiAccessLike, onChange: () => void): () => void {
  access.onstatechange = onChange;
  return () => {
    if (access.onstatechange === onChange) access.onstatechange = null;
  };
}
