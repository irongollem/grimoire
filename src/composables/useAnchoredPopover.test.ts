import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useAnchoredPopover } from "./useAnchoredPopover";

/** A trigger and a panel; `startOpen` mounts the panel already open, as the crafting workbench's picker does. */
function harness(startOpen: boolean, onDismiss: () => void = () => {}) {
  return defineComponent({
    setup() {
      const trigger = ref<HTMLElement | null>(null);
      const open = ref(startOpen);
      const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => {
        open.value = false;
        onDismiss();
      });
      return () =>
        h("div", [
          h("button", { ref: trigger }, "dish"),
          open.value ? h("div", { ref: floatingRef, style: floatingStyle.value, "data-test": "panel" }, "panel") : null,
        ]);
    },
  });
}

describe("useAnchoredPopover", () => {
  it("positions a panel that mounts already open", async () => {
    const w = mount(harness(true), { attachTo: document.body });
    await nextTick();
    await nextTick();
    expect((w.get("[data-test=panel]").element as HTMLElement).style.visibility).toBe("visible");
    w.unmount();
  });

  it("closes on Escape", async () => {
    const w = mount(harness(true), { attachTo: document.body });
    await nextTick();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(w.find("[data-test=panel]").exists()).toBe(false);
    w.unmount();
  });

  async function opened(onDismiss: () => void) {
    const w = mount(harness(true, onDismiss), { attachTo: document.body });
    await nextTick();
    await nextTick();
    return w;
  }
  const press = (target: Element) => target.dispatchEvent(new Event("pointerdown", { bubbles: true }));

  it("dismisses on a press outside, but not on the panel or on the trigger that toggles it", async () => {
    const onDismiss = vi.fn();
    const w = await opened(onDismiss);
    press(w.get("[data-test=panel]").element);
    press(w.get("button").element);
    expect(onDismiss).not.toHaveBeenCalled();

    press(document.body);
    expect(onDismiss).toHaveBeenCalledOnce();
    w.unmount();
  });

  it("stops listening once closed or unmounted", async () => {
    const onDismiss = vi.fn();
    const w = await opened(onDismiss);
    press(document.body);
    await nextTick();
    expect(onDismiss).toHaveBeenCalledOnce();

    // Closed now: neither Escape nor another outside press may dismiss again.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    press(document.body);
    expect(onDismiss).toHaveBeenCalledOnce();
    w.unmount();

    const again = await opened(onDismiss);
    again.unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores keys other than Escape", async () => {
    const onDismiss = vi.fn();
    const w = await opened(onDismiss);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onDismiss).not.toHaveBeenCalled();
    w.unmount();
  });

  // The panel can unmount in the tick between opening and attaching; listeners
  // attached then would stay on the document with nothing left to remove them.
  it("attaches nothing when it is torn down in the same tick it opened", async () => {
    const onDismiss = vi.fn();
    const w = mount(harness(true, onDismiss), { attachTo: document.body });
    w.unmount();
    await nextTick();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    press(document.body);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
