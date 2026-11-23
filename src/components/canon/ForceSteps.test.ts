import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonForceStep } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), reach: vi.fn() }));

vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  useCreateForceSteps: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useUpdateForceStep: () => ({ mutate: mocks.update }),
  useDeleteForceStep: () => ({ mutate: mocks.remove }),
  useMoveForceStep: () => ({ mutate: mocks.move }),
  useReachForceStep: () => ({ mutate: mocks.reach }),
}));

import ForceSteps from "./ForceSteps.vue";

const step = (over: Partial<CanonForceStep>): CanonForceStep => ({
  id: "a", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: null, reached_session_id: null,
  ai_provenance: null, created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});
const force = canonEntry({ id: "f1", campaign_id: "c1", part: "force" });
const steps = [step({ id: "a", reached_at: "x" }), step({ id: "b", title: "The river runs bitter.", sort_order: 1, reached_at: "y" }), step({ id: "c", title: "Bell-Note forgets.", sort_order: 2 })];
const mountIt = (rows: CanonForceStep[] = steps) => mount(ForceSteps, { props: { force, steps: rows } });

describe("ForceSteps", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.create.mockResolvedValue(undefined);
  });

  it("marks the step reached as Now, the ones before it Done and the rest Next", () => {
    const states = mountIt().findAll("[data-testid=force-step-state]").map((s) => s.text());
    expect(states).toEqual(["Done", "Now", "Next"]);
  });

  it("adds a step after the last, empties the box, and writes it into this force and campaign", async () => {
    const w = mountIt();
    const input = w.get("input[aria-label='A new step']");
    await input.setValue("  The Kind Country wakes. ");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", force_id: "f1", title: "The Kind Country wakes.", sort_order: 3 }]);
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("keeps the words when the add fails", async () => {
    mocks.create.mockRejectedValue(new Error("no"));
    const w = mountIt();
    const input = w.get("input[aria-label='A new step']");
    await input.setValue("x");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("x");
  });

  it("ticks a step reached or not, naming the step", async () => {
    await mountIt().findAll("input[type=checkbox]")[2].setValue(true);
    expect(mocks.reach).toHaveBeenCalledWith({ step: steps[2], reached: true });
  });

  it("renames a step when its field is left", async () => {
    await mountIt().findAll("textarea[aria-label='The step']")[2].setValue("Bell-Note forgets its name.");
    expect(mocks.update).toHaveBeenCalledWith({ id: "c", patch: { title: "Bell-Note forgets its name." } });
  });

  it("moves a step by its own id and cannot move the first up or the last down", async () => {
    const w = mountIt();
    await w.findAll("button[aria-label='Move this step later']")[0].trigger("click");
    expect(mocks.move).toHaveBeenCalledWith({ steps, id: "a", direction: 1 });
    expect(w.findAll("button[aria-label='Move this step earlier']")[0].attributes("disabled")).toBeDefined();
    expect(w.findAll("button[aria-label='Move this step later']")[2].attributes("disabled")).toBeDefined();
  });

  it("removes a step by id", async () => {
    await mountIt().findAll("button[aria-label='Remove this step']")[1].trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("b");
  });
});
