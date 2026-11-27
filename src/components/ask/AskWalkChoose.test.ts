// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AskWalkChoose from "./AskWalkChoose.vue";

const choose = (answered: boolean) => mount(AskWalkChoose, { props: { item: { kind: "walk-choose", id: 1, text: "How?", answered } } });

describe("AskWalkChoose", () => {
  // Bug caught: the two chips emitting each other's way.
  it("emits sections for Section by section and story for Just tell you", async () => {
    const w = choose(false);
    await w.get("[data-testid=walk-way-sections]").trigger("click");
    await w.get("[data-testid=walk-way-story]").trigger("click");
    expect(w.emitted("choose")).toEqual([["sections"], ["story"]]);
  });

  // Bug caught: chips still pressable after a way was chosen.
  it("goes quiet once answered", () => {
    expect(choose(true).find("[data-testid=walk-way-story]").exists()).toBe(false);
  });
});
