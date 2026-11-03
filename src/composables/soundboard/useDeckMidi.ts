/**
 * Drives the deck from MIDI hardware (#1136): a Novation Launchpad in
 * Programmer mode with lights, and any other controller through MIDI Learn.
 * The byte-level work is in `lib/audio/deck/midi/`; this is the wiring:
 * permission, plug and unplug, tap-versus-hold on tool buttons, light diffs
 * from the snapshot, and letting go of everything when a device goes away.
 */

import { getCurrentScope, onScopeDispose, type Ref, readonly, ref, watch } from "vue";
import type { DeckAction, DeckPhase, DeckSnapshot, DeckTool } from "@/lib/audio/deck/deckSurface";
import { createHoldTap, TAP_MS } from "@/lib/audio/deck/holdTap";
import {
  blankLedFrame,
  buildLedFrame,
  clampRowOffset,
  decodeLaunchpadMessage,
  diffLedFrames,
  encodeLedMessages,
  type LaunchpadEvent,
  type LedFrame,
  programmerModeMessage,
} from "@/lib/audio/deck/midi/launchpadProtocol";
import type { LaunchpadButton, LaunchpadProfile } from "@/lib/audio/deck/midi/launchpadProfiles";
import {
  findLaunchpads,
  findOtherInputs,
  type MidiAccessLike,
  type MidiInputLike,
  type MidiOutputLike,
  type NavigatorLike,
  requestMidi,
  watchMidiState,
} from "@/lib/audio/deck/midi/midiAccess";
import {
  findBinding,
  type LearnTarget,
  learnStep,
  loadBindings,
  type MidiBinding,
  parseIncoming,
  resolveBound,
  saveBindings,
  type StorageLike,
} from "@/lib/audio/deck/midi/midiLearn";

export type MidiSupport = "unsupported" | "idle" | "requesting" | "granted" | "denied";

/** The deck controller's side of the contract, taken as a parameter. */
export interface DeckMidiTarget {
  dispatch(action: DeckAction): void;
  snapshot: Readonly<Ref<DeckSnapshot>>;
}

export interface DeckMidiOptions {
  navigator?: NavigatorLike | null;
  storage?: StorageLike | null;
  /** Milliseconds, injectable for tests. */
  now?: () => number;
}

export interface ConnectedLaunchpad {
  id: string;
  label: string;
  portName: string;
}

export interface OtherMidiInput {
  id: string;
  name: string;
}

export { TAP_MS };
export const LIGHTS_STORAGE_KEY = "grimoire.deckMidi.lights.v1";

interface LiveLaunchpad {
  id: string;
  profile: LaunchpadProfile;
  input: MidiInputLike;
  output: MidiOutputLike;
  frame: LedFrame | null;
  /** The page row the device's top row shows; the arrows move it one row. */
  rowOffset: number;
}

type SendPhase = (phase: DeckPhase) => void;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function useDeckMidi(deck: DeckMidiTarget, options: DeckMidiOptions = {}) {
  const nav = options.navigator === undefined ? (globalThis.navigator as NavigatorLike | undefined) ?? null : options.navigator;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => Date.now());

  const support = ref<MidiSupport>(nav && typeof nav.requestMIDIAccess === "function" ? "idle" : "unsupported");
  const launchpads = ref<ConnectedLaunchpad[]>([]);
  const otherInputs = ref<OtherMidiInput[]>([]);
  const bindings = ref<MidiBinding[]>(loadBindings(storage));
  const learning = ref<LearnTarget | null>(null);
  const lightsEnabled = ref(readLights());
  const error = ref<string | null>(null);

  let access: MidiAccessLike | null = null;
  let stopWatching: (() => void) | null = null;
  const live = new Map<string, LiveLaunchpad>();
  const learnInputs = new Map<string, MidiInputLike>();
  const heldPads = new Map<string, { lane: number; row: number }>();
  const buttons = createHoldTap(now);

  function readLights(): boolean {
    try {
      return storage?.getItem(LIGHTS_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function setLights(on: boolean) {
    lightsEnabled.value = on;
    try {
      storage?.setItem(LIGHTS_STORAGE_KEY, on ? "1" : "0");
    } catch {
      // Not persisted this session; the switch still works.
    }
    for (const lp of live.values()) {
      if (on) pushLights(lp, true);
      else clearLights(lp);
    }
  }

  // --- lights ---

  function send(lp: LiveLaunchpad, messages: number[][]) {
    for (const m of messages) lp.output.send(m);
  }

  function pushLights(lp: LiveLaunchpad, full: boolean) {
    if (!lightsEnabled.value) return;
    const next = buildLedFrame(lp.profile, deck.snapshot.value, lp.rowOffset);
    const changed = diffLedFrames(full ? null : lp.frame, next);
    lp.frame = next;
    if (changed.size > 0) send(lp, encodeLedMessages(lp.profile, changed));
  }

  function clearLights(lp: LiveLaunchpad) {
    if (lp.frame) send(lp, encodeLedMessages(lp.profile, blankLedFrame(lp.frame)));
    lp.frame = null;
  }

  watch(
    () => deck.snapshot.value,
    (next, prev) => {
      // Another page starts at its top row, as the screen does.
      const newPage = prev !== undefined && next.pageIndex !== prev.pageIndex;
      for (const lp of live.values()) {
        if (newPage) lp.rowOffset = 0;
        pushLights(lp, false);
      }
    },
  );

  // --- held state ---

  function padKey(source: string, lane: number, row: number) {
    return `${source}|${lane},${row}`;
  }

  function padDown(source: string, lane: number, row: number, velocity?: number) {
    heldPads.set(padKey(source, lane, row), { lane, row });
    buttons.padPressed();
    deck.dispatch(velocity === undefined ? { type: "press", lane, row } : { type: "press", lane, row, velocity });
  }

  function padUp(source: string, lane: number, row: number) {
    if (!heldPads.delete(padKey(source, lane, row))) return;
    deck.dispatch({ type: "release", lane, row });
  }

  function toolSender(tool: DeckTool): SendPhase {
    return (phase) => deck.dispatch({ type: "tool", tool, phase });
  }

  const hushSender: SendPhase = (phase) => deck.dispatch({ type: "hush", phase });

  /** Lets go of everything a source still holds, so nothing sticks. */
  function releaseSource(source: string) {
    for (const [key, pad] of heldPads) {
      if (!key.startsWith(`${source}|`)) continue;
      heldPads.delete(key);
      deck.dispatch({ type: "release", lane: pad.lane, row: pad.row });
    }
    buttons.releaseMatching((key) => key.startsWith(`${source}|`));
  }

  // --- Launchpad input ---

  function onButton(lp: LiveLaunchpad, button: LaunchpadButton, down: boolean) {
    if (button === null) return;
    const source = lp.id;
    // A tool and Hush borrow while held and lock on a tap; the rest fire on the press.
    if (button.action === "tool") {
      buttons.edge(`${source}|tool:${button.tool}`, down, toolSender(button.tool));
      return;
    }
    if (button.action === "hush") {
      buttons.edge(`${source}|hush`, down, hushSender);
      return;
    }
    if (!down) return;
    switch (button.action) {
      case "play":
        // Play unlocks whatever tool was tapped on.
        deck.dispatch({ type: "tool", tool: "play", phase: "toggle" });
        return;
      case "page":
        if (button.index < deck.snapshot.value.pages.length) deck.dispatch({ type: "page", index: button.index });
        return;
      case "pageStep":
        deck.dispatch({ type: "pageStep", delta: button.delta });
        return;
      case "rowStep":
        lp.rowOffset = clampRowOffset(lp.rowOffset + button.delta, deck.snapshot.value.rows);
        pushLights(lp, false);
        return;
      case "fadeAll":
      case "pauseAll":
      case "stopAll":
        deck.dispatch({ type: button.action });
    }
  }

  function onLaunchpadEvent(lp: LiveLaunchpad, ev: LaunchpadEvent) {
    const source = lp.id;
    switch (ev.kind) {
      case "pad": {
        // Clamped here too: the page may have lost rows since the arrows moved.
        const row = ev.row + clampRowOffset(lp.rowOffset, deck.snapshot.value.rows);
        if (ev.down) padDown(source, ev.lane, row, lp.profile.hasVelocity ? ev.velocity / 127 : undefined);
        else padUp(source, ev.lane, row);
        return;
      }
      case "top":
        onButton(lp, lp.profile.topRow[ev.index] ?? null, ev.down);
        return;
      case "right":
        onButton(lp, lp.profile.rightColumn[ev.index] ?? null, ev.down);
        return;
      case "left":
        if (!ev.down) return;
        if (ev.button === "stopAll") deck.dispatch({ type: "stopAll" });
        else deck.dispatch({ type: "pageStep", delta: ev.button === "prev" ? -1 : 1 });
    }
  }

  function attachLaunchpad(found: { profile: LaunchpadProfile; input: MidiInputLike; output: MidiOutputLike }) {
    const lp: LiveLaunchpad = { id: found.input.id, ...found, frame: null, rowOffset: 0 };
    live.set(lp.id, lp);
    found.input.onmidimessage = (e) => {
      if (!e.data) return;
      const ev = decodeLaunchpadMessage(lp.profile, e.data);
      if (ev) onLaunchpadEvent(lp, ev);
    };
    found.output.send(programmerModeMessage(found.profile, true));
    pushLights(lp, true);
  }

  function detachLaunchpad(lp: LiveLaunchpad, deviceStillThere: boolean) {
    releaseSource(lp.id);
    lp.input.onmidimessage = null;
    live.delete(lp.id);
    // An unplugged device cannot be told anything; a live one goes back to Live mode.
    if (deviceStillThere) {
      try {
        lp.output.send(programmerModeMessage(lp.profile, false));
      } catch {
        // The port closed under us.
      }
    }
  }

  // --- learned controllers ---

  function onLearnedMessage(deviceName: string, data: Uint8Array | null) {
    if (!data) return;
    const msg = parseIncoming(data);
    if (!msg) return;
    const step = learnStep(learning.value, bindings.value, deviceName, msg);
    if (step.consumed) {
      if (step.bindings !== bindings.value) {
        bindings.value = [...step.bindings];
        saveBindings(storage, bindings.value);
      }
      learning.value = step.learning;
      return;
    }
    const binding = findBinding(bindings.value, deviceName, msg);
    if (!binding) return;
    const ev = resolveBound(binding, msg);
    const source = `learn:${deviceName}`;
    const t = ev.target;
    switch (t.type) {
      case "pad":
        if (ev.down) padDown(source, t.lane, t.row, ev.velocity);
        else padUp(source, t.lane, t.row);
        return;
      case "tool":
        buttons.edge(`${source}|tool:${t.tool}`, ev.down, toolSender(t.tool));
        return;
      case "hush":
        buttons.edge(`${source}|hush`, ev.down, hushSender);
        return;
      case "master":
        deck.dispatch({ type: "master", value: ev.level });
        return;
      case "padVolume":
        deck.dispatch({ type: "padVolume", lane: t.lane, row: t.row, value: ev.level });
        return;
      case "pageStep":
        if (ev.down) deck.dispatch({ type: "pageStep", delta: t.delta });
        return;
      case "fadeAll":
      case "pauseAll":
      case "stopAll":
        if (ev.down) deck.dispatch({ type: t.type });
    }
  }

  // --- connection ---

  function sync() {
    if (!access) return;
    const found = findLaunchpads(access);
    const ids = new Set(found.map((f) => f.input.id));
    for (const lp of live.values()) if (!ids.has(lp.id)) detachLaunchpad(lp, false);
    for (const f of found) if (!live.has(f.input.id)) attachLaunchpad(f);
    launchpads.value = [...live.values()].map((lp) => ({
      id: lp.id,
      label: lp.profile.label,
      portName: lp.input.name ?? lp.profile.portSubstring,
    }));

    const others = findOtherInputs(access);
    const otherIds = new Set(others.map((i) => i.id));
    for (const [id, input] of learnInputs) {
      if (otherIds.has(id)) continue;
      releaseSource(`learn:${input.name ?? id}`);
      input.onmidimessage = null;
      learnInputs.delete(id);
    }
    for (const input of others) {
      if (learnInputs.has(input.id)) continue;
      learnInputs.set(input.id, input);
      const name = input.name ?? input.id;
      input.onmidimessage = (e) => onLearnedMessage(name, e.data);
    }
    otherInputs.value = others.map((i) => ({ id: i.id, name: i.name ?? i.id }));
  }

  /** Must run from a click or key press: the browser asks permission only then. */
  async function connect() {
    if (support.value === "unsupported" || support.value === "requesting") return;
    support.value = "requesting";
    error.value = null;
    const result = await requestMidi(nav);
    if (result.status === "unsupported") {
      support.value = "unsupported";
      return;
    }
    if (result.status === "denied") {
      support.value = "denied";
      error.value = result.error;
      return;
    }
    access = result.access;
    support.value = "granted";
    stopWatching = watchMidiState(access, sync);
    sync();
  }

  /** Back to Live mode and every held pad or tool let go. */
  function disconnect() {
    stopWatching?.();
    stopWatching = null;
    for (const lp of live.values()) detachLaunchpad(lp, true);
    for (const input of learnInputs.values()) input.onmidimessage = null;
    for (const source of new Set([...heldPads.keys(), ...buttons.keys()].map((k) => k.split("|")[0]))) {
      releaseSource(source);
    }
    learnInputs.clear();
    access = null;
    launchpads.value = [];
    otherInputs.value = [];
    learning.value = null;
    if (support.value === "granted") support.value = "idle";
  }

  // --- learn API ---

  function beginLearn(target: LearnTarget) {
    learning.value = target;
  }

  function cancelLearn() {
    learning.value = null;
  }

  function removeBinding(binding: MidiBinding) {
    bindings.value = bindings.value.filter(
      (b) =>
        !(
          b.deviceName === binding.deviceName &&
          b.kind === binding.kind &&
          b.channel === binding.channel &&
          b.number === binding.number
        ),
    );
    saveBindings(storage, bindings.value);
  }

  // --- lifetime ---

  const onPageHide = () => disconnect();
  if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
      disconnect();
    });
  }

  return {
    support: readonly(support),
    error: readonly(error),
    launchpads: readonly(launchpads),
    otherInputs: readonly(otherInputs),
    lightsEnabled: readonly(lightsEnabled),
    setLightsEnabled: setLights,
    bindings: readonly(bindings),
    learning: readonly(learning),
    connect,
    disconnect,
    beginLearn,
    cancelLearn,
    removeBinding,
  };
}
