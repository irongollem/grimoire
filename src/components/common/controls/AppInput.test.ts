import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import AppInput from "./AppInput.vue";

/**
 * Events are triggered by hand rather than through `setValue`, which fires
 * `input` AND `change` together. A browser fires `change` only when the field is
 * finished — blurred or Enter — and that difference is the entire subject of
 * these tests, so the helper that erases it cannot be used here.
 */
function type(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find("input");
  (input.element as HTMLInputElement).value = value;
  return input.trigger("input");
}

function commit(wrapper: ReturnType<typeof mount>) {
  return wrapper.find("input").trigger("change");
}

function mountBound<T>(value: T, modifiers: Record<string, true> = {}) {
  const state = ref(value);
  const wrapper = mount(AppInput, {
    props: {
      modelValue: state.value,
      modelModifiers: modifiers,
      "onUpdate:modelValue": (v: unknown) => {
        state.value = v as T;
      },
    },
  });
  return { wrapper, state };
}

describe("AppInput v-model", () => {
  it("commits on every keystroke by default", async () => {
    const { wrapper, state } = mountBound("");
    await type(wrapper, "ab");
    expect(state.value).toBe("ab");
  });

  it("with .lazy, does not commit while typing", async () => {
    const { wrapper, state } = mountBound("", { lazy: true });
    await type(wrapper, "ST");
    expect(state.value).toBe("");
  });

  it("with .lazy, commits on change — which covers both blur and Enter", async () => {
    const { wrapper, state } = mountBound("", { lazy: true });
    await type(wrapper, "STR");
    await commit(wrapper);
    expect(state.value).toBe("STR");
  });

  it("without .lazy, a change does not double-commit", async () => {
    let calls = 0;
    const wrapper = mount(AppInput, {
      props: { modelValue: "", "onUpdate:modelValue": () => (calls += 1) },
    });
    await type(wrapper, "a");
    await commit(wrapper);
    expect(calls).toBe(1);
  });

  it("applies .number, reading a cleared field as absent rather than zero", async () => {
    const { wrapper, state } = mountBound<number | null>(null, { number: true });
    await type(wrapper, "12");
    expect(state.value).toBe(12);
    await type(wrapper, "");
    expect(state.value).toBeNull();
  });

  it("applies .trim, and combines with .lazy", async () => {
    const { wrapper, state } = mountBound("", { trim: true, lazy: true });
    await type(wrapper, "  padded  ");
    expect(state.value).toBe("");
    await commit(wrapper);
    expect(state.value).toBe("padded");
  });

  it("re-syncs the DOM when the parent normalizes what was committed", async () => {
    // The reason .lazy sites exist: the parent parses "str" into something else
    // and the field has to show that, not what was typed.
    const state = ref("");
    const wrapper = mount(AppInput, {
      props: {
        modelValue: state.value,
        modelModifiers: { lazy: true },
        "onUpdate:modelValue": () => (state.value = "PARSED"),
      },
    });
    await type(wrapper, "str");
    await commit(wrapper);
    await wrapper.setProps({ modelValue: state.value });
    await nextTick();
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("PARSED");
  });

  it("renders the hooks Vellum styles its fields by", () => {
    const wrapper = mount(AppInput, { props: { modelValue: "x", size: "lg", tone: "muted" } });
    const input = wrapper.get("input");
    expect(input.attributes("data-field")).toBe("input");
    expect(input.attributes("data-field-size")).toBe("lg");
    expect(input.attributes("data-field-tone")).toBe("muted");
  });
});

describe("AppInput wrap", () => {
  function mountWrap() {
    const state = ref("");
    let updates = 0;
    const wrapper = mount(AppInput, {
      props: {
        modelValue: "",
        modelModifiers: { lazy: true },
        wrap: true,
        "onUpdate:modelValue": (v: unknown) => {
          updates += 1;
          state.value = v as string;
        },
      },
    });
    return { wrapper, state, updates: () => updates };
  }

  it("a plain field stays a one-line <input>", () => {
    // Bug: wrap leaking into every field and turning them all into textareas.
    const wrapper = mount(AppInput, { props: { modelValue: "x" } });
    expect(wrapper.find("input").exists()).toBe(true);
    expect(wrapper.find("textarea").exists()).toBe(false);
  });

  it("Enter commits a lazy sentence once and adds no line break", async () => {
    // Bug: Enter inserting a newline into a statement, or never committing.
    const { wrapper, state, updates } = mountWrap();
    const area = wrapper.get("textarea");
    (area.element as HTMLTextAreaElement).value = "Debts outlive the people who owe them";
    await area.trigger("input");
    expect(updates()).toBe(0);
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true, bubbles: true });
    area.element.dispatchEvent(enter);
    await nextTick();
    expect(enter.defaultPrevented).toBe(true);
    expect(state.value).toBe("Debts outlive the people who owe them");
    expect(updates()).toBe(1);
  });

  it("pasted line breaks are committed as single spaces", async () => {
    // Bug: a pasted paragraph carrying raw newlines into a one-paragraph statement.
    const { wrapper, state } = mountWrap();
    const area = wrapper.get("textarea");
    (area.element as HTMLTextAreaElement).value = "First\r\n\nsecond\n  third";
    await area.trigger("input");
    await area.trigger("change");
    expect(state.value).toBe("First second third");
  });
});
