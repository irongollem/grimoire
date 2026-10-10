import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, ref } from "vue";
import AppCheckbox from "./AppCheckbox.vue";

/**
 * AppCheckbox re-implements Vue's two native checkbox bindings (boolean toggle
 * and string[] group) behind one defineModel, because a component v-model
 * cannot reach the native array magic. The array path is the part worth
 * pinning: 3 call sites depend on check-adds / uncheck-removes semantics, and
 * a regression there silently empties a picker instead of erroring.
 */
function mountCheckbox(initial: boolean | string[], props: Record<string, unknown> = {}) {
  const model = ref(initial);
  const wrapper = mount({
    setup: () => () =>
      h(AppCheckbox as never, {
        modelValue: model.value,
        "onUpdate:modelValue": (v: boolean | string[]) => (model.value = v),
        ...props,
      }),
  });
  return { wrapper, model, input: wrapper.find("input") };
}

describe("AppCheckbox", () => {
  it("toggles a boolean model", async () => {
    const { wrapper, model, input } = mountCheckbox(false, { label: "Cursed" });
    await input.setValue(true);
    expect(model.value).toBe(true);
    await input.setValue(false);
    expect(model.value).toBe(false);
    wrapper.unmount();
  });

  it("adds and removes its value in an array model", async () => {
    const { wrapper, model, input } = mountCheckbox(["a"], { value: "b", label: "B" });
    expect((input.element as HTMLInputElement).checked).toBe(false);
    await input.setValue(true);
    expect(model.value).toEqual(["a", "b"]);
    await input.setValue(false);
    expect(model.value).toEqual(["a"]);
    wrapper.unmount();
  });

  it("reads checked state from array membership", () => {
    const { wrapper, input } = mountCheckbox(["x", "y"], { value: "y", label: "Y" });
    expect((input.element as HTMLInputElement).checked).toBe(true);
    wrapper.unmount();
  });

  it("renders label text and a hint line, and the hint forces start alignment", () => {
    const { wrapper } = mountCheckbox(false, { label: "Shuffle", hint: "Randomize track order." });
    expect(wrapper.text()).toContain("Shuffle");
    expect(wrapper.text()).toContain("Randomize track order.");
    expect(wrapper.find("label").classes()).toContain("items-start");
    expect(wrapper.find("input").classes()).toContain("mt-0.5");
    wrapper.unmount();
  });

  it("passes unknown attrs (title, required) to the input, not the label", () => {
    const { wrapper, input } = mountCheckbox(false, {
      label: "Consent",
      title: "Required to continue",
      required: true,
    });
    expect(input.attributes("title")).toBe("Required to continue");
    expect(input.attributes("required")).toBeDefined();
    expect(wrapper.find("label").attributes("title")).toBeUndefined();
    wrapper.unmount();
  });

  it("exposes the element and a focus method to call sites", () => {
    const wrapper = mount(
      {
        components: { AppCheckbox },
        template: `<AppCheckbox ref="box" :model-value="false" label="Focus me" />`,
      },
      { attachTo: document.body },
    );
    const exposed = (wrapper.vm as unknown as { $refs: Record<string, unknown> }).$refs.box as {
      focus: () => void;
      el: HTMLInputElement | null;
    };
    expect(typeof exposed.focus).toBe("function");
    exposed.focus();
    expect(document.activeElement).toBe(wrapper.find("input").element);
    wrapper.unmount();
  });
});
