import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeckToolStrip from "./DeckToolStrip.vue";
import DeckTransport from "./DeckTransport.vue";
import { HOLD_MS } from "./tapOrHold";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const strip = (extra: Record<string, unknown> = {}) =>
  mount(DeckToolStrip, { props: { tool: "play", lockedTool: "play", controls: "full", layout: "grid", showKeys: true, ...extra } });

const buttonFor = (w: ReturnType<typeof strip>, label: string) => {
  const found = w.findAll("button").find((b) => b.text().includes(label));
  if (found === undefined) throw new Error(`no ${label} button`);
  return found;
};

describe("DeckToolStrip", () => {
  it("a quick tap locks the tool: one toggle, no borrow", async () => {
    const w = strip();
    const loop = buttonFor(w, "Loop");
    await loop.trigger("pointerdown");
    vi.advanceTimersByTime(HOLD_MS - 50);
    await loop.trigger("pointerup");
    await loop.trigger("click", { detail: 1 });
    expect(w.emitted("tool")).toEqual([[{ tool: "loop", phase: "toggle" }]]);
  });

  it("a hold borrows the tool: down at the threshold, up on release, never a toggle", async () => {
    const w = strip();
    const fade = buttonFor(w, "Fade");
    await fade.trigger("pointerdown");
    vi.advanceTimersByTime(HOLD_MS + 10);
    expect(w.emitted("tool")).toEqual([[{ tool: "fade", phase: "down" }]]);
    await fade.trigger("pointerup");
    await fade.trigger("pointerleave");
    await fade.trigger("click", { detail: 1 });
    expect(w.emitted("tool")).toEqual([
      [{ tool: "fade", phase: "down" }],
      [{ tool: "fade", phase: "up" }],
    ]);
  });

  it("a keyboard activation toggles, since it has no hold to measure", async () => {
    const w = strip();
    await buttonFor(w, "Solo").trigger("click", { detail: 0 });
    expect(w.emitted("tool")).toEqual([[{ tool: "solo", phase: "toggle" }]]);
  });

  it("releases a borrowed tool when the strip unmounts mid-hold", async () => {
    const w = strip();
    await buttonFor(w, "Volume").trigger("pointerdown");
    vi.advanceTimersByTime(HOLD_MS + 10);
    w.unmount();
    expect(w.emitted("tool")?.at(-1)).toEqual([{ tool: "volume", phase: "up" }]);
  });

  it("shows only play, loop and stop in Simple", () => {
    const labels = strip({ controls: "simple" }).findAll("button").map((b) => b.text());
    expect(labels).toHaveLength(3);
    expect(labels.join(" ")).not.toContain("Volume");
  });
});

describe("DeckTransport", () => {
  it("Hush follows the same rule: tap toggles, hold borrows", async () => {
    const w = mount(DeckTransport, { props: { paused: false, hush: false, masterVolume: 1 } });
    const hush = w.findAll("button").find((b) => b.text().includes("Hush"));
    if (hush === undefined) throw new Error("no hush");
    await hush.trigger("pointerdown");
    await hush.trigger("pointerup");
    await hush.trigger("pointerdown");
    vi.advanceTimersByTime(HOLD_MS + 10);
    await hush.trigger("pointerup");
    expect(w.emitted("hush")).toEqual([[{ phase: "toggle" }], [{ phase: "down" }], [{ phase: "up" }]]);
  });

  it("offers Resume instead of Pause all while paused", () => {
    const w = mount(DeckTransport, { props: { paused: true, hush: false, masterVolume: 1 } });
    expect(w.text()).toContain("Resume");
    expect(w.text()).not.toContain("Pause all");
  });
});
