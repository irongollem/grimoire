// Z, D, F, E on the Zoning tab (#1125 frame 19). The workbench test covers the wiring; this holds the two guards
// that keep the capture listener from taking keys it has no business with.
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useZoningKeys } from "./useZoningKeys";
import type { EditorLayer } from "@/cartographer/keymap";

const TOOLS = [{ id: "erase", shortcut: "e" }, { id: "fill", shortcut: "f" }] as const;

function host(state: { layer: EditorLayer; enabled: boolean }, pick: (tool: string) => void) {
  return mount(
    defineComponent({
      setup() {
        useZoningKeys({ layer: () => state.layer, enabled: () => state.enabled, tools: TOOLS, pick });
        return () => h("div");
      },
    }),
  );
}
const press = (key: string, target: EventTarget = window) => {
  const ev = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true });
  target.dispatchEvent(ev);
  return ev;
};

describe("useZoningKeys", () => {
  it("picks the tool and takes the key from the Drawing's handler on the Zoning tab", () => {
    const pick = vi.fn();
    const later = vi.fn();
    window.addEventListener("keydown", later);
    const w = host({ layer: "plan", enabled: true }, pick);
    const ev = press("e");
    expect(pick).toHaveBeenCalledWith("erase");
    expect(ev.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled(); // the editor's own window listener never sees it
    window.removeEventListener("keydown", later);
    w.unmount();
  });

  it("does nothing on a page where the editor is not editing (read-only), even if the layer says Zoning", () => {
    const pick = vi.fn();
    const w = host({ layer: "plan", enabled: false }, pick);
    const ev = press("f");
    expect(pick).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    w.unmount();
  });

  it("does nothing on the Drawing tab, so its own E and F keep working", () => {
    const pick = vi.fn();
    const w = host({ layer: "drawing", enabled: true }, pick);
    press("e");
    expect(pick).not.toHaveBeenCalled();
    w.unmount();
  });

  it("lets go of the window when the editor goes away", () => {
    const pick = vi.fn();
    const w = host({ layer: "plan", enabled: true }, pick);
    w.unmount();
    press("e");
    expect(pick).not.toHaveBeenCalled();
  });

  it("does not take a letter typed into a field", () => {
    const pick = vi.fn();
    const w = host({ layer: "plan", enabled: true }, pick);
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("e", input);
    expect(pick).not.toHaveBeenCalled();
    input.remove();
    w.unmount();
  });
});
