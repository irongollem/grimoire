import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import type { DeckAction } from "@/lib/audio/deck/deckSurface";
import { TAP_MS } from "@/lib/audio/deck/holdTap";

// useDeck pulls in the stores and queries; the keyboard only needs its dispatch.
vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({ dispatch: vi.fn() }) }));

const { useDeckHotkeys } = await import("./useDeckHotkeys");

let scope: EffectScope;
let actions: DeckAction[];
let clock: number;

function key(type: "keydown" | "keyup", k: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent(type, { key: k, code: init.code ?? `Key${k.toUpperCase()}`, bubbles: true, cancelable: true, ...init }));
}
const down = (k: string, init?: KeyboardEventInit) => key("keydown", k, init);
const up = (k: string, init?: KeyboardEventInit) => key("keyup", k, init);

beforeEach(() => {
  actions = [];
  clock = 1000;
  scope = effectScope();
  scope.run(() => useDeckHotkeys({ dispatch: (a) => void actions.push(a) }, { now: () => clock }));
});

afterEach(() => {
  scope.stop();
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("number keys", () => {
  it("map 1 to 8 to the top row of lanes 1 to 8, press then release (fails if a lane were off by one)", () => {
    for (let n = 1; n <= 8; n++) {
      down(String(n), { code: `Digit${n}` });
      up(String(n), { code: `Digit${n}` });
    }
    const presses = actions.filter((a) => a.type === "press");
    const releases = actions.filter((a) => a.type === "release");
    expect(presses.map((a) => (a.type === "press" ? [a.lane, a.row] : null))).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((l) => [l, 0]));
    expect(releases).toHaveLength(8);
    expect(releases[2]).toEqual({ type: "release", lane: 2, row: 0 });
  });

  it("do not fire on 9 or with the browser's tab chord (fails if modifiers were ignored)", () => {
    down("9", { code: "Digit9" });
    down("1", { code: "Digit1", metaKey: true });
    down("1", { code: "Digit1", ctrlKey: true });
    expect(actions).toEqual([]);
  });

  it("fire once while a key auto-repeats (fails if a held Gate pad were re-pressed)", () => {
    down("1", { code: "Digit1" });
    down("1", { code: "Digit1", repeat: true });
    down("1", { code: "Digit1", repeat: true });
    up("1", { code: "Digit1" });
    expect(actions.filter((a) => a.type === "press")).toHaveLength(1);
  });
});

describe("tool keys", () => {
  it("a hold borrows the tool: down then up, no lock", () => {
    down("l");
    clock += TAP_MS + 100;
    up("l");
    expect(actions).toEqual([
      { type: "tool", tool: "loop", phase: "down" },
      { type: "tool", tool: "loop", phase: "up" },
    ]);
  });

  it("a quick tap also locks it (fails if tapping did nothing lasting)", () => {
    down("s");
    clock += TAP_MS - 1;
    up("s");
    expect(actions.map((a) => (a.type === "tool" ? a.phase : a.type))).toEqual(["down", "up", "toggle"]);
  });

  it("a pad fired while the key is down makes it a hold even when quick (fails if the pad was not noticed)", () => {
    down("f");
    down("1", { code: "Digit1" });
    up("1", { code: "Digit1" });
    up("f");
    expect(actions.some((a) => a.type === "tool" && a.phase === "toggle")).toBe(false);
  });

  it("maps every letter to its tool", () => {
    const wanted = { l: "loop", s: "stop", f: "fade", o: "solo", v: "volume", e: "edit" } as const;
    for (const [k, tool] of Object.entries(wanted)) {
      actions.length = 0;
      down(k);
      up(k);
      expect(actions[0]).toEqual({ type: "tool", tool, phase: "down" });
    }
  });

  it("p goes back to play", () => {
    down("p");
    up("p");
    expect(actions).toEqual([{ type: "tool", tool: "play", phase: "toggle" }]);
  });
});

describe("hush", () => {
  it("holds and taps like a tool", () => {
    down("h");
    clock += TAP_MS + 1;
    up("h");
    expect(actions).toEqual([
      { type: "hush", phase: "down" },
      { type: "hush", phase: "up" },
    ]);
    actions.length = 0;
    down("h");
    up("h");
    expect(actions.map((a) => (a.type === "hush" ? a.phase : a.type))).toEqual(["down", "up", "toggle"]);
  });
});

describe("transport keys", () => {
  it("x stops, shift+f fades all (and plain f stays the Fade tool)", () => {
    down("x");
    down("F", { shiftKey: true });
    expect(actions).toEqual([{ type: "stopAll" }, { type: "fadeAll" }]);
  });

  it("leaves Space alone, so a focused button still presses (fails if the deck claims Space app-wide)", () => {
    const event = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(actions).toEqual([]);
  });

  it("does not fire while typing in a field", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX", bubbles: true, cancelable: true }));
    input.remove();
    expect(actions).toEqual([]);
  });
});

describe("teardown", () => {
  it("lets go of a key still held when the scope stops (fails if a held tool stuck)", () => {
    down("l");
    scope.stop();
    expect(actions.some((a) => a.type === "tool" && a.phase === "up")).toBe(true);
  });
});
