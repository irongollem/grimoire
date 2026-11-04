import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeckPad from "./DeckPad.vue";
import { fixtureCell, fixtureEmpty } from "./deckFixtures";
import type { DeckCellView, DeckControls, DeckTool } from "@/lib/audio/deck/deckSurface";

function mountPad(
  cell: DeckCellView,
  extra: { tool?: DeckTool; mode?: "play" | "build"; controls?: DeckControls } = {},
) {
  return mount(DeckPad, {
    props: { cell, size: "md", controls: extra.controls ?? "full", tool: extra.tool ?? "play", mode: extra.mode ?? "play" },
  });
}

const pointer = (type: string, init: Record<string, number | string> = {}) =>
  new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, ...init });

describe("DeckPad press and release", () => {
  it("sends exactly one release for one press, however many events end it", async () => {
    // pointerup is followed by lostpointercapture in a browser; a Gate pad that
    // heard two releases (or a Repeat pad that heard none) would misbehave.
    const w = mountPad(fixtureCell({ mode: "gate", modeIsDefault: false }));
    await w.trigger("pointerdown", { button: 0, pointerId: 1 });
    await w.trigger("pointerup");
    await w.trigger("lostpointercapture");
    expect(w.emitted("press")).toHaveLength(1);
    expect(w.emitted("release")).toHaveLength(1);
  });

  it("does not release at all when nothing was pressed", async () => {
    const w = mountPad(fixtureCell());
    await w.trigger("lostpointercapture");
    await w.trigger("pointercancel");
    expect(w.emitted("release")).toBeUndefined();
  });

  it("ignores key auto-repeat so a held Enter is one press", async () => {
    const w = mountPad(fixtureCell());
    await w.trigger("keydown", { key: "Enter" });
    await w.trigger("keydown", { key: "Enter", repeat: true });
    await w.trigger("keydown", { key: "Enter", repeat: true });
    await w.trigger("keyup", { key: "Enter" });
    expect(w.emitted("press")).toHaveLength(1);
    expect(w.emitted("release")).toHaveLength(1);
  });

  it("releases a held key when the pad loses focus, so a Gate pad cannot stick on", async () => {
    const w = mountPad(fixtureCell({ mode: "gate", modeIsDefault: false }));
    await w.trigger("keydown", { key: " " });
    await w.trigger("blur");
    // The keyup never arrives once focus is gone, so the blur must have released.
    expect(w.emitted("release")).toHaveLength(1);
    // And a stray auto-repeat from the dying key must not press again.
    await w.trigger("keydown", { key: " ", repeat: true });
    expect(w.emitted("press")).toHaveLength(1);
  });

  it("with the Volume tool a drag sets the level and never presses", async () => {
    const w = mountPad(fixtureCell(), { tool: "volume" });
    const el = w.element as HTMLElement;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100, left: 0, width: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(pointer("pointerdown", { clientY: 50 }));
    el.dispatchEvent(pointer("pointermove", { clientY: 20 }));
    el.dispatchEvent(pointer("pointerup", { clientY: 20 }));
    expect(w.emitted("padVolume")).toEqual([[0.5], [0.8]]);
    expect(w.emitted("press")).toBeUndefined();
    expect(w.emitted("release")).toBeUndefined();
  });

  it("in build mode a click selects and does not press", async () => {
    const w = mountPad(fixtureCell(), { mode: "build" });
    await w.trigger("pointerdown", { button: 0 });
    await w.trigger("click");
    expect(w.emitted("press")).toBeUndefined();
    expect(w.emitted("select")).toHaveLength(1);
  });
});

describe("DeckPad under a finger", () => {
  // A phone scrolls the deck with the same finger that plays it.
  const touch = (type: string, init: Record<string, number> = {}) => pointer(type, { pointerType: "touch", clientX: 10, clientY: 10, ...init });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays a tap when the finger lifts where it landed", () => {
    vi.useFakeTimers();
    const w = mountPad(fixtureCell());
    w.element.dispatchEvent(touch("pointerdown"));
    expect(w.emitted("press")).toBeUndefined();
    w.element.dispatchEvent(touch("pointerup"));
    expect(w.emitted("press")).toHaveLength(1);
    expect(w.emitted("release")).toHaveLength(1);
  });

  it("does not play a swipe that starts on the pad", () => {
    vi.useFakeTimers();
    const w = mountPad(fixtureCell());
    w.element.dispatchEvent(touch("pointerdown"));
    w.element.dispatchEvent(touch("pointermove", { clientY: 40 }));
    w.element.dispatchEvent(touch("pointerup", { clientY: 40 }));
    vi.advanceTimersByTime(500);
    expect(w.emitted("press")).toBeUndefined();
  });

  it("does not play when the browser takes the touch for a scroll", () => {
    vi.useFakeTimers();
    const w = mountPad(fixtureCell());
    w.element.dispatchEvent(touch("pointerdown"));
    w.element.dispatchEvent(touch("pointercancel"));
    vi.advanceTimersByTime(500);
    expect(w.emitted("press")).toBeUndefined();
    expect(w.emitted("release")).toBeUndefined();
  });

  it("holds a Gate pad while a still finger stays down, and releases it on lift", () => {
    vi.useFakeTimers();
    const w = mountPad(fixtureCell({ mode: "gate", modeIsDefault: false }));
    w.element.dispatchEvent(touch("pointerdown"));
    vi.advanceTimersByTime(200);
    expect(w.emitted("press")).toHaveLength(1);
    expect(w.emitted("release")).toBeUndefined();
    w.element.dispatchEvent(touch("pointerup"));
    expect(w.emitted("press")).toHaveLength(1);
    expect(w.emitted("release")).toHaveLength(1);
  });

  it("a mouse still plays the moment it goes down", () => {
    const w = mountPad(fixtureCell());
    w.element.dispatchEvent(pointer("pointerdown", { pointerType: "mouse" }));
    expect(w.emitted("press")).toHaveLength(1);
  });
});

describe("DeckPad appearance", () => {
  it("hides a default launch glyph in Simple but shows a non-default one", () => {
    const hidden = mountPad(fixtureCell({ mode: "trigger", modeIsDefault: true }), { controls: "simple" });
    const gate = mountPad(fixtureCell({ mode: "gate", modeIsDefault: false }), { controls: "simple" });
    const full = mountPad(fixtureCell({ mode: "trigger", modeIsDefault: true }), { controls: "full" });
    expect(hidden.find("svg[title]").exists()).toBe(false);
    expect(gate.find("svg[title]").exists()).toBe(true);
    expect(full.find("svg[title]").exists()).toBe(true);
  });

  it("renders a void cell as a non-interactive, hidden element", () => {
    const w = mountPad(fixtureEmpty());
    expect(w.element.tagName).toBe("DIV");
    expect(w.attributes("aria-hidden")).toBe("true");
    expect(w.attributes("tabindex")).toBeUndefined();
  });

  it("renders an empty slot in build mode as a drop target button", () => {
    const w = mountPad(fixtureEmpty(), { mode: "build" });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("data-pad-state")).toBe("empty");
  });

  it("says why a blocked pad is blocked, in words on the pad", () => {
    const w = mountPad(fixtureCell({ light: "blocked", blockedReason: "Spotify: this device only" }));
    expect(w.text()).toContain("Spotify: this device only");
    expect(w.attributes("aria-label")).toContain("Spotify: this device only");
  });

  it("shows the chip for the active tool: Loop off on a non-looping pad, Stop only when audible", () => {
    expect(mountPad(fixtureCell({ loop: false }), { tool: "loop" }).find("[data-tool-chip]").text()).toBe("Loop off");
    expect(mountPad(fixtureCell({ light: "ready" }), { tool: "stop" }).find("[data-tool-chip]").exists()).toBe(false);
    expect(mountPad(fixtureCell({ light: "playing" }), { tool: "stop" }).find("[data-tool-chip]").text()).toBe("Stop");
    expect(mountPad(fixtureCell({ volume: 0.42 }), { tool: "volume" }).find("[data-tool-chip]").text()).toBe("42%");
  });

  it("marks one dot per take and fills the next one", () => {
    const w = mountPad(fixtureCell({ takes: 3, nextTake: 1 }));
    const dots = w.findAll("[title='3 takes'] > span");
    expect(dots).toHaveLength(3);
    expect(dots.map((d) => d.classes().includes("opacity-100"))).toEqual([false, true, false]);
  });
});

describe("DeckPad guest", () => {
  const guest = fixtureCell({
    padId: null,
    guest: { sourceId: "fight:1", label: "Goblin ambush", target: "playlist-1" },
    name: "Battle theme",
    meta: "From Goblin ambush",
    light: "playing",
  });

  it("draws a guest as a playable pad, not an empty or void slot", () => {
    // Bug: padId === null was read as "empty", so the audio playing by itself had no pad to stop.
    for (const mode of ["play", "build"] as const) {
      const w = mountPad(guest, { mode });
      expect(w.find("[data-pad-state='playing']").exists()).toBe(true);
      expect(w.text()).toContain("From Goblin ambush");
      expect(w.find("[data-pad-state='empty']").exists()).toBe(false);
      expect(w.find("[data-pad-state='void']").exists()).toBe(false);
    }
  });

  it("presses like a pad", async () => {
    const w = mountPad(guest);
    await w.find("[data-pad-state='playing']").trigger("pointerdown", { button: 0, pointerId: 1 });
    expect(w.emitted("press")).toHaveLength(1);
  });

  it("is not draggable in build mode", () => {
    // Bug: dragging a guest would carry a null pad id and drop nothing.
    expect(mountPad(guest, { mode: "build" }).find("[data-guest]").attributes("draggable")).toBe("false");
  });
});
