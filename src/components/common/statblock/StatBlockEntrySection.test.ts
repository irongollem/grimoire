import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import StatBlockEntrySection from "./StatBlockEntrySection.vue";
import type { ActionStructure, StatBlockEntry } from "@/types/statBlock.types";

const RichTextEditorStub = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("textarea", {
        class: "rte",
        value: props.modelValue,
        onInput: (e: Event) => emit("update:modelValue", (e.target as HTMLTextAreaElement).value),
      });
  },
});

const CLAW =
  "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.";

function mountSection(initial: StatBlockEntry[]) {
  const model = ref<StatBlockEntry[]>(initial);
  const wrapper = mount(
    {
      setup: () => () =>
        h(StatBlockEntrySection as never, {
          modelValue: model.value,
          "onUpdate:modelValue": (v: StatBlockEntry[]) => (model.value = v),
          label: "Action",
          list: "actions",
          siblings: ["Claw"],
        }),
    },
    { global: { stubs: { RichTextEditor: RichTextEditorStub } } },
  );
  return { wrapper, model };
}

const blank: StatBlockEntry = { name: "Claw", description: "", structured: { kind: "other", source: "parsed" } };

describe("StatBlockEntrySection", () => {
  it("shows the roll the prose parses to as the description is typed", async () => {
    const { wrapper, model } = mountSection([blank]);
    await wrapper.find("textarea.rte").setValue(CLAW);
    expect(model.value[0].structured.kind).toBe("attack");
    expect(wrapper.find("[data-test=rolls-as-summary]").text()).toContain("+4 to hit");
    expect(wrapper.find("[data-test=rolls-as-summary]").text()).toContain("1d8+3 slashing");
  });

  it("keeps a hand-set structure through a description edit", async () => {
    const manual: ActionStructure = {
      kind: "attack",
      source: "manual",
      attack: { delivery: "melee", bonus: 9, reach: 10, hit: [{ dice: "3d6", type: "fire" }] },
    };
    const { wrapper, model } = mountSection([{ ...blank, description: CLAW, structured: manual }]);
    await wrapper.find("textarea.rte").setValue(`${CLAW} It snarls.`);
    expect(model.value[0].structured).toEqual(manual);
    expect(wrapper.text()).toContain("Set by hand");
  });

  it("re-parses the prose on Reset to parsed", async () => {
    const manual = { kind: "other", source: "manual" } as const;
    const { wrapper, model } = mountSection([{ ...blank, description: CLAW, structured: manual }]);
    const reset = wrapper.findAll("button").find((b) => b.text() === "Reset to parsed");
    expect(reset).toBeDefined();
    await reset?.trigger("click");
    expect(model.value[0].structured.source).toBe("parsed");
    expect(model.value[0].structured.kind).toBe("attack");
  });

  it("offers Set by hand when the numbers could not be read", () => {
    const { wrapper } = mountSection([
      { ...blank, description: CLAW, structured: { kind: "other", source: "parsed", review: "bonus not in text" } },
    ]);
    expect(wrapper.text()).toContain("Couldn't read the numbers: bonus not in text");
    expect(wrapper.findAll("button").some((b) => b.text() === "Set by hand")).toBe(true);
  });

  it("writes a manual structure from the roll editor", async () => {
    const { wrapper, model } = mountSection([{ ...blank, description: CLAW, structured: { kind: "other", source: "parsed" } }]);
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(model.value[0].structured.kind).toBe("other");
    expect(model.value[0].structured.source).toBe("manual");
    expect(wrapper.find("form").exists()).toBe(false);
  });
});

describe("StatBlockEntrySection adding and removing", () => {
  const named = (name: string, description: string): StatBlockEntry => ({ ...blank, name, description });
  const names = (wrapper: ReturnType<typeof mountSection>["wrapper"]) =>
    wrapper.findAll("input").map((input) => (input.element as HTMLInputElement).value);

  it("+ Add appends one empty entry after the existing ones", async () => {
    const { wrapper, model } = mountSection([named("Claw", "x")]);
    await wrapper.findAll("button").find((b) => b.text() === "+ Add Action")?.trigger("click");

    expect(model.value.map((e) => e.name)).toEqual(["Claw", ""]);
    expect(model.value[1]).toMatchObject({ description: "", structured: { kind: "other", source: "parsed" } });
    expect(names(wrapper)).toEqual(["Claw", ""]);
  });

  it("removing the middle entry drops that one and keeps what the others show", async () => {
    const { wrapper, model } = mountSection([named("Claw", "a"), named("Bite", "b"), named("Tail", "c")]);
    await wrapper.findAll("button[aria-label='Remove action']")[1].trigger("click");

    expect(model.value.map((e) => e.name)).toEqual(["Claw", "Tail"]);
    expect(names(wrapper)).toEqual(["Claw", "Tail"]);
    expect(wrapper.findAll("textarea.rte").map((t) => (t.element as HTMLTextAreaElement).value)).toEqual(["a", "c"]);
  });

  // Index keys made Tiptap reuse the deleted entry's editor for its neighbour, blanking
  // the first name and the last description (see the note on `nextKey` in the SFC).
  it("removing an entry keeps each remaining entry's own editor instead of handing it a neighbour's", async () => {
    const { wrapper } = mountSection([named("Claw", "a"), named("Bite", "b"), named("Tail", "c")]);
    const before = wrapper.findAll("textarea.rte").map((t) => t.element);
    await wrapper.findAll("button[aria-label='Remove action']")[1].trigger("click");

    const after = wrapper.findAll("textarea.rte").map((t) => t.element);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[2]);
  });

  it("removing an entry closes a roll editor that was open on another", async () => {
    const { wrapper } = mountSection([named("Claw", CLAW), named("Bite", "x")]);
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");
    expect(wrapper.find("form").exists()).toBe(true);

    await wrapper.findAll("button[aria-label='Remove action']")[1].trigger("click");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("typing in the description does not close the roll editor the DM has open", async () => {
    const { wrapper } = mountSection([named("Claw", CLAW)]);
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");
    await wrapper.find("textarea.rte").setValue(`${CLAW} It snarls.`);

    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("replacing the whole list from outside (applying a template) closes the roll editor", async () => {
    const { wrapper, model } = mountSection([named("Claw", CLAW)]);
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");

    const editorBefore = wrapper.find("textarea.rte").element;
    model.value = [named("Bite", "x")];
    await wrapper.vm.$nextTick();

    expect(wrapper.find("form").exists()).toBe(false);
    // A replaced list is new entries, so they get fresh editors rather than the old ones reused.
    expect(wrapper.find("textarea.rte").element).not.toBe(editorBefore);
    expect(names(wrapper)).toEqual(["Bite"]);
  });
});

describe("StatBlockEntrySection options", () => {
  it("lists the choices of an options entry and writes one from the editor", async () => {
    const options: ActionStructure = {
      kind: "options",
      source: "manual",
      options: [
        { name: "Fire Breath", kind: "save", save: { ability: "dex", dc: 15, fail: [{ dice: "12d6", type: "fire" }], success: "half", conditions: [] } },
        { name: "Sleep Breath", kind: "save", save: { ability: "con", dc: 15, fail: [], success: "none", conditions: [{ name: "Prone" }] } },
      ],
    };
    const { wrapper, model } = mountSection([{ ...blank, name: "Breath Weapons", description: "x", structured: options }]);
    const items = wrapper.findAll("[data-test=rolls-as-options] li");
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("Fire Breath");
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(model.value[0].structured.options).toHaveLength(2);
    expect(model.value[0].structured.kind).toBe("options");
  });

  it("will not save an options entry with fewer than two choices", async () => {
    const one: ActionStructure = {
      kind: "options",
      source: "manual",
      options: [{ name: "Only", kind: "save", save: { ability: "dex", dc: 15, fail: [], success: "none", conditions: [] } }],
    };
    const { wrapper, model } = mountSection([{ ...blank, description: "x", structured: one }]);
    await wrapper.findAll("button").find((b) => b.text() === "Edit roll")?.trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find("[role=alert]").text()).toContain("at least two");
    expect(model.value[0].structured.options).toHaveLength(1);
  });
});
