import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExperimentOutcomeModal from "./ExperimentOutcomeModal.vue";
import { _resetModalStack } from "@/components/common/overlays/modalStack";

vi.mock("@/components/common/ai/GenerationCostBadge.vue", () => ({ default: { template: "<span>cost</span>" } }));

function open(result: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return mount(ExperimentOutcomeModal, {
    props: { open: true, result, discipline: { label: "Smithing" }, chatNotice: null, ...over } as never,
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

afterEach(() => {
  _resetModalStack();
  document.body.innerHTML = "";
});

describe("ExperimentOutcomeModal inventing", () => {
  it("offers the question on nothing and near, when inventing is on, and emits it", () => {
    const w = open({ result: "none" }, { canInvent: true });
    button("Ask what these could make")?.click();
    expect(w.emitted("invent")).toHaveLength(1);
    w.unmount();
    document.body.innerHTML = "";
    open({ result: "near", hint: "missing" }, { canInvent: true });
    expect(button("Ask what these could make")).toBeDefined();
  });

  it("does not offer it when inventing is off, or on a match", () => {
    open({ result: "none" });
    expect(button("Ask what these could make")).toBeUndefined();
    document.body.innerHTML = "";
    open({ result: "match", recipeId: "r", name: "Dagger" }, { canInvent: true });
    expect(button("Ask what these could make")).toBeUndefined();
  });

  it("shows what came of asking", () => {
    open({ result: "none" }, { canInvent: true, inventMessage: "Nothing comes to mind: too little." });
    expect(document.body.textContent).toContain("Nothing comes to mind: too little.");
  });
});
