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

describe("StatBlockEntrySection options", () => {
  it("lists the choices of an options entry and writes one from the editor", async () => {
    const options: ActionStructure = {
      kind: "options",
      source: "manual",
      options: [
        { name: "Fire Breath", kind: "save", save: { ability: "dex", dc: 15, fail: [{ dice: "12d6", type: "fire" }], success: "half", conditions: [] } },
        { name: "Sleep Breath", kind: "save", save: { ability: "con", dc: 15, fail: [], success: "none", conditions: ["Prone"] } },
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
