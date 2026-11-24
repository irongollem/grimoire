import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PassageTellSome from "./PassageTellSome.vue";

const members = [{ id: "m1", name: "Pip" }, { id: "m2", name: "Sift" }, { id: "m3", name: "Wren" }];

describe("PassageTellSome", () => {
  // Bug caught: Tell with nobody ticked told nobody (or the whole party) while looking like it did something.
  it("will not tell until someone is ticked", async () => {
    const w = mount(PassageTellSome, { props: { members } });
    const tell = w.find("[data-testid=tell-some-confirm]");
    expect(tell.attributes("disabled")).toBeDefined();
    await w.find("[data-testid=tell-some-m1] input, input[data-testid=tell-some-m1]").setValue(true);
    expect(w.find("[data-testid=tell-some-confirm]").attributes("disabled")).toBeUndefined();
  });

  // Bug caught: the chooser told the whole party, or the first ticked one only, instead of exactly who was ticked.
  it("tells exactly the ticked members", async () => {
    const w = mount(PassageTellSome, { props: { members } });
    await w.find("input[data-testid=tell-some-m1]").setValue(true);
    await w.find("input[data-testid=tell-some-m3]").setValue(true);
    await w.find("[data-testid=tell-some-confirm]").trigger("click");
    expect(w.emitted("tell")).toEqual([[["m1", "m3"]]]);
  });

  // Bug caught: widening started with nobody ticked, so confirming dropped the people who already had the passage.
  it("starts with those who already have it ticked", async () => {
    const w = mount(PassageTellSome, { props: { members, told: ["m2"] } });
    await w.find("input[data-testid=tell-some-m3]").setValue(true);
    await w.find("[data-testid=tell-some-confirm]").trigger("click");
    expect(w.emitted("tell")).toEqual([[["m2", "m3"]]]);
  });

  it("cancels without telling", async () => {
    const w = mount(PassageTellSome, { props: { members } });
    await w.find("[data-testid=tell-some-cancel]").trigger("click");
    expect(w.emitted("cancel")).toHaveLength(1);
    expect(w.emitted("tell")).toBeUndefined();
  });
});
