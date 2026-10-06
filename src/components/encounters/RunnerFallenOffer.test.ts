// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RunnerFallenOffer from "./RunnerFallenOffer.vue";
import type { RunCombatant } from "@/types/encounter.types";

const stubs = { AppButton: { props: ["label"], template: "<button>{{ label }}</button>" } };

describe("RunnerFallenOffer", () => {
  it("names the character, records nothing, and offers two choices", async () => {
    const w = mount(RunnerFallenOffer, { props: { combatant: { name: "Chicory" } as RunCombatant }, global: { stubs } });
    expect(w.text()).toContain("Chicory has failed three death saves.");
    expect(w.text()).toContain("Nothing is recorded until you choose. A revivify has a minute.");
    await w.find("[data-testid=offer-dismiss]").trigger("click");
    await w.find("[data-testid=offer-mark]").trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
    expect(w.emitted("mark")).toHaveLength(1);
    expect(w.find("[data-testid=offer-mark]").text()).toBe("Mark as fallen…");
  });
});
