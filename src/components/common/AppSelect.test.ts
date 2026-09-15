import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, nextTick, ref } from "vue";
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

describe("non-string model values", () => {
  function selectEl(wrapper: { find: (s: string) => { element: Element } }) {
    return wrapper.find("select").element as HTMLSelectElement;
  }

  // `:value="model"` stringifies, so a null model cannot be expressed through
  // it — Vue drops the attribute for `<option :value="null">`, the option's DOM
  // value degrades to its TEXT, nothing matches "", and the control renders
  // blank while the model holds a perfectly good choice.
  it("shows the option bound to a null value as selected", async () => {
    const wrapper = mount(AppSelect, {
      props: { modelValue: null },
      slots: { default: () => [h("option", { value: null }, "All surfaces"), h("option", { value: "tile_pack" }, "Tile Pack")] },
      attachTo: document.body,
    });
    await nextTick();

    expect(selectEl(wrapper).selectedIndex).toBe(0);
    wrapper.unmount();
  });

  it("re-selects once options arrive after the model, as a resolving query does", async () => {
    const options = ref<string[]>([]);
    const Parent = {
      setup() {
        return () =>
          h(AppSelect, { modelValue: "entity_image" }, {
            default: () => [
              h("option", { value: null }, "All surfaces"),
              ...options.value.map((o) => h("option", { value: o, key: o }, o)),
            ],
          });
      },
    };
    const wrapper = mount(Parent, { attachTo: document.body });
    await nextTick();
    // Nothing matches yet, and a native single select always shows SOMETHING —
    // its first option. That is the bug this guards: the control claims "All
    // surfaces" while the model says entity_image.
    expect(selectEl(wrapper).selectedIndex).toBe(0);

    options.value = ["tile_pack", "entity_image"];
    await nextTick();

    expect(selectEl(wrapper).selectedIndex).toBe(2);
    wrapper.unmount();
  });

  it("invents no selection when the model matches no option", async () => {
    // A native single select cannot show "nothing" — it falls back to its first
    // option, which is browser behaviour this component does not try to fight.
    // What it must not do is move the selection to some other arbitrary option,
    // or write that fallback back into the model.
    const wrapper = mount(AppSelect, {
      props: { modelValue: "nothing_matches" },
      slots: { default: () => [h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")] },
      attachTo: document.body,
    });
    await nextTick();

    expect(selectEl(wrapper).selectedIndex).toBe(0);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});
