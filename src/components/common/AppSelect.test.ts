import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, ref } from "vue";
import AppSelect from "./AppSelect.vue";

/**
 * AppSelect binds `:value` + `@change` rather than `v-model` on the native element,
 * so that `v-model.number` works. That hand-rolled path has to reproduce what Vue's
 * own select v-model does, and the interesting part is option *identity*: for a
 * bound `:value`, Vue stashes the real value on the element as `_value` and may not
 * write a `value` attribute at all. Reading `select.value` instead silently
 * substitutes the option's text.
 */
function mountSelect(initial: unknown, options: () => unknown[]) {
  const model = ref(initial);
  const wrapper = mount({
    setup: () => () =>
      h(
        AppSelect as never,
        {
          modelValue: model.value,
          "onUpdate:modelValue": (v: unknown) => (model.value = v),
        },
        options,
      ),
  });
  return { wrapper, model, select: wrapper.find("select") };
}

describe("AppSelect", () => {
  it("preserves a null option value instead of falling back to its text", async () => {
    const { wrapper, model, select } = mountSelect("something", () => [
      h("option", { value: null }, "— pick objective —"),
      h("option", { value: "obj-1" }, "Find the amulet"),
    ]);
    (select.element as HTMLSelectElement).selectedIndex = 0;
    await select.trigger("change");
    expect(model.value).toBeNull();
    expect(model.value).not.toBe("— pick objective —");
    wrapper.unmount();
  });

  it("preserves a numeric option value", async () => {
    const { wrapper, model, select } = mountSelect("", () => [
      h("option", { value: 3 }, "3"),
      h("option", { value: 8 }, "8"),
    ]);
    (select.element as HTMLSelectElement).selectedIndex = 1;
    await select.trigger("change");
    expect(model.value).toBe(8);
    expect(typeof model.value).toBe("number");
    wrapper.unmount();
  });

  it("still coerces plain string options under the .number modifier", async () => {
    const model = ref<number | string>("");
    const wrapper = mount({
      setup: () => () =>
        h(
          AppSelect as never,
          {
            modelValue: model.value,
            modelModifiers: { number: true },
            "onUpdate:modelValue": (v: unknown) => (model.value = v as number),
          },
          () => [h("option", { value: "1" }, "one"), h("option", { value: "2" }, "two")],
        ),
    });
    const select = wrapper.find("select");
    (select.element as HTMLSelectElement).selectedIndex = 1;
    await select.trigger("change");
    expect(model.value).toBe(2);
    wrapper.unmount();
  });

  // A bare `ref` on the component would resolve to the instance, so a call site's
  // `selectRef.value?.focus()` would silently do nothing without this.
  it("exposes the element and a focus method to call sites", () => {
    const wrapper = mount(
      {
        components: { AppSelect },
        template: `<AppSelect ref="sel" model-value="a"><option value="a">A</option></AppSelect>`,
      },
      { attachTo: document.body },
    );
    const exposed = (wrapper.vm as unknown as { $refs: Record<string, unknown> }).$refs.sel as {
      focus: () => void;
      el: HTMLSelectElement | null;
    };
    expect(typeof exposed.focus).toBe("function");
    exposed.focus();
    expect(document.activeElement).toBe(wrapper.find("select").element);
    wrapper.unmount();
  });
});
