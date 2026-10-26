import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TypeChoiceChips from "./TypeChoiceChips.vue";
import { typeChoices } from "@/lib/worldLinks/connections";

const choices = typeChoices("npc", "deity");

function mountPicker(props: Partial<InstanceType<typeof TypeChoiceChips>["$props"]> = {}) {
  return mount(TypeChoiceChips, { props: { choices, ...props } });
}

describe("TypeChoiceChips", () => {
  it("offers a pair's common types as chips and keeps the rest behind more", () => {
    const w = mountPicker();
    const words = w.findAll("button").map((b) => b.text());
    expect(words).toContain("worships");
    expect(words).toContain("serves");
    expect(words).not.toContain("forsook");
    expect(words.some((t) => t.startsWith("More"))).toBe(true);
  });

  it("shows the long list, searchable, once more is opened", async () => {
    const w = mountPicker();
    await w.findAll("button").find((b) => b.text().startsWith("More"))!.trigger("click");
    expect(w.findAll("button").map((b) => b.text())).toContain("forsook");
    await w.get("input[type=search]").setValue("defi");
    const words = w.findAll("button").map((b) => b.text());
    expect(words).toContain("defies");
    expect(words).not.toContain("forsook");
  });

  it("emits the choice picked, direction and all", async () => {
    const w = mountPicker();
    await w.findAll("button").find((b) => b.text() === "worships")!.trigger("click");
    expect(w.emitted("pick")?.[0]?.[0]).toMatchObject({ key: "worships", subjectIsFrom: true });
  });

  it("marks the choice a tie already holds", () => {
    const w = mountPicker({ current: { key: "worships", subjectIsFrom: true } });
    const worships = w.findAll("button").find((b) => b.text() === "worships")!;
    expect(worships.attributes("aria-pressed") ?? worships.attributes("data-state") ?? worships.classes().join(" ")).toBeTruthy();
  });

  it("shows only the list for a pair with no common types", () => {
    const w = mountPicker({ choices: choices.filter((c) => !c.common) });
    expect(w.text()).not.toContain("More");
    expect(w.find("input[type=search]").exists()).toBe(true);
  });
});
