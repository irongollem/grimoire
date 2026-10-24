import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { useAnchoredPopover } from "./useAnchoredPopover";

/** A trigger and a panel; `startOpen` mounts the panel already open, as the crafting workbench's picker does. */
function harness(startOpen: boolean) {
  return defineComponent({
    setup() {
      const trigger = ref<HTMLElement | null>(null);
      const open = ref(startOpen);
      const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => (open.value = false));
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
});
