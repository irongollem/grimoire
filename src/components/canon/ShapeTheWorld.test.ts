import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const all = ref([
  canonEntry({ id: "p1", part: "premise" }),
  canonEntry({ id: "t1", part: "truth" }),
  canonEntry({ id: "t2", part: "truth" }),
  canonEntry({ id: "s1", part: "secret" }),
]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: all }) }));
// The helper itself is CanonSuggestions.test.ts; here it only says which mode, scope and entries it was given.
vi.mock("./CanonSuggestions.vue", () => ({
  default: defineComponent({
    props: { mode: { type: String, default: "" }, entries: { type: Array, default: () => [] }, scope: { type: String, default: "" } },
    setup: (props) => () => h("div", { "data-testid": "helper", "data-mode": props.mode, "data-scope": props.scope, "data-count": props.entries.length }),
  }),
}));

import ShapeTheWorld from "./ShapeTheWorld.vue";

const next = (w: ReturnType<typeof mount>) => w.findAll("button").find((b) => b.text() === "Next")!.trigger("click");
const back = (w: ReturnType<typeof mount>) => w.findAll("button").find((b) => b.text() === "Back")!.trigger("click");
const shown = (w: ReturnType<typeof mount>) => w.get("[data-testid=helper]").attributes("data-mode");

describe("ShapeTheWorld", () => {
  // Bug caught: a step mounted the wrong helper (secrets on the truths step) or the walk skipped or reordered one.
  it("walks Premise, Truths, What is moving, Secrets, Questions, each on its own helper mode", async () => {
    const w = mount(ShapeTheWorld);
    const seen: { title: string; mode: string | undefined }[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push({ title: w.get("[data-testid=shape-step-title]").text(), mode: shown(w) });
      if (i < 4) await next(w);
    }
    expect(seen).toEqual([
      { title: "Premise", mode: "premise" },
      { title: "Truths", mode: "truths" },
      { title: "What is moving", mode: "forces" },
      { title: "Secrets", mode: "secrets" },
      { title: "Questions", mode: "questions" },
    ]);
  });

  // Bug caught: a step with no sentence about its purpose, which is what makes the walk a guide and not five buttons.
  it("says what each step is for", async () => {
    const w = mount(ShapeTheWorld);
    for (let i = 0; i < 5; i++) {
      expect(w.get("[data-testid=shape-step-purpose]").text().length).toBeGreaterThan(20);
      if (i < 4) await next(w);
    }
  });

  // Bug caught: Back off the first step went to step 0 minus one (a blank walk), or Next off the last ran past the end.
  it("stops at both ends, and Done on the last step closes the walk", async () => {
    const w = mount(ShapeTheWorld);
    expect(w.findAll("button").find((b) => b.text() === "Back")!.attributes("disabled")).toBeDefined();
    await next(w);
    await back(w);
    expect(shown(w)).toBe("premise");
    for (let i = 0; i < 4; i++) await next(w);
    expect(w.findAll("button").some((b) => b.text() === "Next")).toBe(false);
    await w.findAll("button").find((b) => b.text() === "Done")!.trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  // Bug caught: a step counted another part's entries, so the helper numbered what it adds from the wrong list; and a
  // walk sharing proposals with the part's own mount (no scope) showed one set of proposals twice.
  it("gives each helper its own part's entries and a scope apart from the part's mount", async () => {
    const w = mount(ShapeTheWorld);
    await next(w);
    const helper = w.get("[data-testid=helper]");
    expect(helper.attributes("data-count")).toBe("2");
    expect(helper.attributes("data-scope")).toBe("walk");
  });
});
