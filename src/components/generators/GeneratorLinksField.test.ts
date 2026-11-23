import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import GeneratorLinksField from "./GeneratorLinksField.vue";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

type Picked = { kind: string; id: string; name: string };
const PickerStub = defineComponent({
  props: { kinds: { type: Array, default: () => [] } },
  emits: ["pick"],
  setup(props, { emit }) {
    return () => h("div", { "data-kinds": (props.kinds as string[]).join(",") }, [
      h("button", { "data-pick": "auril", onClick: () => emit("pick", { kind: "deity", id: "d1", name: "Auril" } satisfies Picked) }, "Auril"),
      h("button", { "data-pick": "docks", onClick: () => emit("pick", { kind: "location", id: "l1", name: "The Docks" } satisfies Picked) }, "Docks"),
    ]);
  },
});

function render(modelValue: GeneratorLink[] = [], subjectKind: "npc" | "item" = "npc") {
  return mount(GeneratorLinksField, {
    props: { modelValue, subjectKind, noun: "this NPC" },
    global: { stubs: { AppModal: { template: "<div><slot /></div>" }, ModalHeader: true, WorldEntityPicker: PickerStub } },
  });
}
const choiceButton = (w: ReturnType<typeof render>, word: string) => w.findAll("[data-choice]").find((b) => b.text() === word);
const held = (kind: "deity" | "location", id: string, name: string, key: string): GeneratorLink => ({
  kind, id, name, choice: typeChoices("npc", kind).find((c) => c.key === key)!,
});

describe("GeneratorLinksField", () => {
  it("adds a chip with the tie's words, read from the new record, once a record and a type are chosen", async () => {
    const w = render();
    await w.get("[data-testid=generator-link-add]").trigger("click");
    await w.get("[data-pick=auril]").trigger("click");
    await choiceButton(w, "worships")!.trigger("click");
    const emitted = w.emitted("update:modelValue")![0]![0] as GeneratorLink[];
    expect(emitted).toMatchObject([{ kind: "deity", id: "d1", name: "Auril", choice: { key: "worships", subjectIsFrom: true } }]);
  });

  it("shows each chosen tie as a chip and removes only the one pressed", async () => {
    const a = held("deity", "d1", "Auril", "worships");
    const b = held("location", "l1", "The Docks", "works_at");
    const w = render([a, b]);
    expect(w.findAll("[data-testid=generator-link-chip]").map((c) => c.text())).toEqual(["Worships · Auril", "Works at · The Docks"]);
    await w.findAll("[data-testid=generator-link-chip]")[0]!.trigger("click");
    expect(w.emitted("update:modelValue")![0]![0]).toEqual([b]);
  });

  // Bug caught: the same tie picked twice was written twice.
  it("does not add the same tie twice", async () => {
    const w = render([held("deity", "d1", "Auril", "worships")]);
    await w.get("[data-testid=generator-link-add]").trigger("click");
    await w.get("[data-pick=auril]").trigger("click");
    await choiceButton(w, "worships")!.trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  // Bug caught: the picker offered kinds with no type for an NPC, a dead end after the pick; family has its own field.
  it("offers only kinds the catalogue ties an NPC to, and never family types", async () => {
    const w = render();
    await w.get("[data-testid=generator-link-add]").trigger("click");
    expect(w.get("[data-kinds]").attributes("data-kinds")).toBe("npc,party_member,faction,location,deity,item,canon");
    await w.get("[data-pick=auril]").trigger("click");
    expect(choiceButton(w, "worships")).toBeDefined();
    await w.get("[data-testid=generator-link-add]").trigger("click");
    await w.get("[data-pick=docks]").trigger("click");
    const words = w.findAll("[data-choice]").map((b) => b.text());
    expect(words).toContain("works at");
    expect(words).not.toContain("worships");
  });

  // Bug caught: family types were offered here too, written as plain links beside the page's own kin field.
  it("never offers a family type between two people", async () => {
    const w = render();
    await w.get("[data-testid=generator-link-add]").trigger("click");
    w.findComponent(PickerStub).vm.$emit("pick", { kind: "npc", id: "n1", name: "Brenna" });
    await w.vm.$nextTick();
    // Family sits among the types behind "More…", so open them.
    await w.get("[data-testid=more-types]").trigger("click");
    const words = w.findAll("[data-choice]").map((b) => b.text());
    expect(words).toContain("mentor of");
    expect(words.some((word) => /parent|spouse|sibling|relative/.test(word))).toBe(false);
  });

  // Bug caught: a picker row for a kind that offers no type (an item to an item) is a dead end after the pick.
  it("lists only the kinds the new record can be tied to", async () => {
    const w = render([], "item");
    await w.get("[data-testid=generator-link-add]").trigger("click");
    expect(w.get("[data-kinds]").attributes("data-kinds")!.split(",")).not.toContain("item");
  });
});
