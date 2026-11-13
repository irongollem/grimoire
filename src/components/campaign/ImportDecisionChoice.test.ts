import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("@/components/campaign/ImportLinkPicker.vue", () => ({
  default: { name: "ImportLinkPicker", props: ["kind"], template: "<div class='picker' />" },
}));

import ImportDecisionChoice from "./ImportDecisionChoice.vue";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";

const suggested: EntityCandidate = { targetId: "a", source: "campaign", name: "Armor, hide", matchKind: "near", detail: null, distance: null };
const byHand: EntityCandidate = { targetId: "b", source: "deity", name: "Moradin", matchKind: "chosen", detail: "the Soul Forger", distance: null };

function open(decision: ImportDecision, props: Record<string, unknown> = {}) {
  return mount(ImportDecisionChoice, { props: { heading: "Hide armor", groupName: "g", candidates: [suggested], modelValue: decision, ...props } });
}

describe("ImportDecisionChoice", () => {
  it("shows a hand-picked link, which the matcher did not suggest, as the checked option", () => {
    const w = open({ action: "link", candidate: byHand });
    expect(w.text()).toContain("Moradin");
    expect(w.text()).toContain("picked by you");
    expect(w.text()).toContain("your deity");
    const checked = w.findAll("input:checked");
    expect(checked).toHaveLength(1);
    expect(checked[0].element.closest("label")?.textContent).toContain("Moradin");
  });

  it("does not add a second row when the chosen link is one of the suggestions", () => {
    const w = open({ action: "link", candidate: { ...suggested } });
    expect(w.text()).not.toContain("picked by you");
  });

  it("offers the search only for a kind other than quests, and mounts it only once asked for", async () => {
    expect(open({ action: "create" }).text()).not.toContain("Link to something else");
    expect(open({ action: "create" }, { searchKind: "quests" }).text()).not.toContain("Link to something else");
    const w = open({ action: "create" }, { searchKind: "items" });
    expect(w.find(".picker").exists()).toBe(false);
    const button = w.findAll("button").find((b) => b.text().includes("Link to something else"));
    await button!.trigger("click");
    expect(w.find(".picker").exists()).toBe(true);
  });
});
