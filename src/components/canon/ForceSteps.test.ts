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

const todayRef = vi.hoisted(() => ({ current: null as { year: number | null; month: number | null; day: number | null } | null }));
vi.mock("@/composables/canon/useWorldToday", async () => {
  const { computed } = await import("vue");
  return { useWorldToday: () => computed(() => todayRef.current) };
});
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { epochName: "", months: [{ num: 3, name: "Harvest", days: 30 }], formatDate: (y: number, m: number | null, d: number | null) => `${d === null ? "" : `${d} `}${m === null ? "" : "Harvest "}${y}`.trim() } }),
}));

import ForceSteps from "./ForceSteps.vue";
import WorldDateField from "./WorldDateField.vue";

const step = (over: Partial<CanonForceStep>): CanonForceStep => ({
  id: "a", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: null, reached_session_id: null, due_year: null, due_month: null, due_day: null,
  ai_provenance: null, created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});
const force = canonEntry({ id: "f1", campaign_id: "c1", part: "force" });
const steps = [step({ id: "a", reached_at: "x" }), step({ id: "b", title: "The river runs bitter.", sort_order: 1, reached_at: "y" }), step({ id: "c", title: "Bell-Note forgets.", sort_order: 2 })];
const mountIt = (rows: CanonForceStep[] = steps) => mount(ForceSteps, { props: { force, steps: rows } });

describe("ForceSteps", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.create.mockResolvedValue(undefined);
    todayRef.current = null;
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

  // Bug caught (#1258 item 9): a due date saved without its shape, or a day with no month sent, which the table refuses with 23514.
  it("saves a step's due date as the three columns, and never sends a day without its month", async () => {
    const w = mountIt();
    await w.findAll("[data-testid=force-step-due-toggle]")[2].trigger("click");
    const field = w.getComponent(WorldDateField);
    field.vm.$emit("change", { year: 512, month: 3, day: 3 });
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "c", patch: { due_year: 512, due_month: 3, due_day: 3 } });
    field.vm.$emit("change", { year: 512, month: null, day: 3 });
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "c", patch: { due_year: 512, due_month: null, due_day: null } });
  });

  // Bug caught: Clear leaving the old date behind, or clearing only the year.
  it("clears a due date in all three columns", async () => {
    const w = mountIt([step({ id: "a", due_year: 512, due_month: 3, due_day: 3 })]);
    await w.get("[data-testid=force-step-due-toggle]").trigger("click");
    await w.get("[data-testid=force-step-due-clear]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "a", patch: { due_year: null, due_month: null, due_day: null } });
  });

  // Bug caught: the due date not shown on the step, so the DM cannot see what they set.
  it("shows the date a step is due on its button", () => {
    const w = mountIt([step({ id: "a", due_year: 512, due_month: 3, due_day: 3 })]);
    expect(w.get("[data-testid=force-step-due-toggle]").text()).toBe("Due 3 Harvest 512");
  });

  // Bug caught: an unreached step past its due date given no warning, or a step not yet due given one.
  it("says a step is due and not reached once the campaign's date is past it, and not before", () => {
    const rows = [step({ id: "a", due_year: 512, due_month: 3, due_day: 3 })];
    todayRef.current = { year: 512, month: 3, day: 3 };
    expect(mountIt(rows).find("[data-testid=force-step-overdue]").exists()).toBe(false);
    todayRef.current = { year: 512, month: 3, day: 4 };
    expect(mountIt(rows).get("[data-testid=force-step-overdue]").text()).toBe("Due 3 Harvest 512, not reached.");
  });

  // Bug caught: a reached step still nagging that it was not reached.
  it("says nothing of a reached step, however late", () => {
    todayRef.current = { year: 900, month: 1, day: 1 };
    expect(mountIt([step({ id: "a", due_year: 512, reached_at: "x" })]).find("[data-testid=force-step-overdue]").exists()).toBe(false);
  });
});
