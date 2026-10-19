// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";
import { mount } from "@vue/test-utils";
import { vRollMode, type RollModeBinding } from "./vRollMode";

function mountTrigger(enabled: ReturnType<typeof ref<boolean>>) {
  return mount(
    defineComponent({
      setup: () => () =>
        withDirectives(h("div", "Acrobatics"), [
          [vRollMode, { enabled: enabled.value, on: () => {} } satisfies RollModeBinding],
        ]),
    }),
  );
}

describe("v-roll-mode", () => {
  // The long-press opens the picker; iOS must not also select the text (#1078).
  it("keeps the OS text selection off a trigger whose picker is enabled", async () => {
    const enabled = ref(true);
    const wrapper = mountTrigger(enabled);
    expect(wrapper.element.style.userSelect).toBe("none");

    enabled.value = false;
    await nextTick();
    expect(wrapper.element.style.userSelect).toBe("");
  });
});
