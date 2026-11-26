import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonForceStep } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn(), reach: vi.fn(), createEvent: vi.fn(), deleteEvent: vi.fn(), linkStep: vi.fn() }));
const events = vi.hoisted(() => ({ current: [] as unknown[] }));
const years = vi.hoisted(() => ({ asked: [] as number[][] }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCalendarEventsRange: (from: { value: number }, to: { value: number }) => {
    years.asked.push([from.value, to.value]);
    return { get data() { return { value: events.current }; } };
  },
  useCreateCalendarEvent: () => ({ mutateAsync: mocks.createEvent }),
  useDeleteCalendarEvent: () => ({ mutateAsync: mocks.deleteEvent }),
}));

vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  updateForceStep: mocks.linkStep,
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
  id: "a", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The orchards sour.", sort_order: 0, reached_at: null, reached_session_id: null, due_year: null, due_month: null, due_day: null, calendar_event_id: null,
  ai_provenance: null, created_at: "2026-11-19T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", ...over,
});
const force = canonEntry({ id: "f1", campaign_id: "c1", part: "force" });
const steps = [step({ id: "a", reached_at: "x" }), step({ id: "b", title: "The river runs bitter.", sort_order: 1, reached_at: "y" }), step({ id: "c", title: "Bell-Note forgets.", sort_order: 2 })];
const mountIt = (rows: CanonForceStep[] = steps) => mount(ForceSteps, { props: { force, steps: rows }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href=\"JSON.stringify(to)\"><slot /></a>" } } } });

describe("ForceSteps", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.create.mockResolvedValue(undefined);
    todayRef.current = null;
    events.current = [];
    years.asked.length = 0;
    mocks.createEvent.mockResolvedValue({ id: "ev1" });
    mocks.linkStep.mockResolvedValue(undefined);
    mocks.deleteEvent.mockResolvedValue(undefined);
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

  // Bug caught (#1279 item 32): the Calendar button on a step with no world date (an event with no date is refused), or a step on a date but no way to put it there.
  it("offers Put this step on the Calendar only for a dated step", () => {
    const w = mountIt([step({ id: "a" }), step({ id: "b", due_year: 512, due_month: 3, due_day: 3 })]);
    expect(w.findAll("[data-testid=force-step-to-calendar]")).toHaveLength(1);
  });

  // Bug caught (#1279 item 32): the event made with another date, another title, or shown to players; or the step never
  // told which event it became, so the button stayed and a second tap made a second event.
  it("makes a hidden world event on the step's date, titled with the step, and points the step at it", async () => {
    const w = mountIt([step({ id: "a", title: "The river runs bitter.", due_year: 512, due_month: 3, due_day: null })]);
    await w.get("[data-testid=force-step-to-calendar]").trigger("click");
    await flushPromises();
    expect(mocks.createEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ campaign_id: "c1", title: "The river runs bitter.", event_type: "world", year: 512, month: 3, day: null, player_visible: false }));
    expect(mocks.linkStep).toHaveBeenCalledExactlyOnceWith("a", { calendar_event_id: "ev1" });
  });

  // Bug caught: the pointer failing after the event was made, so the Calendar held an event the step did not know and a
  // retry made a second one.
  it("takes the event back when the step cannot be pointed at it", async () => {
    mocks.linkStep.mockRejectedValue(new Error("refused"));
    const w = mountIt([step({ id: "a", due_year: 512, due_month: 3 })]);
    await w.get("[data-testid=force-step-to-calendar]").trigger("click");
    await flushPromises();
    expect(mocks.deleteEvent).toHaveBeenCalledExactlyOnceWith("ev1");
  });

  // Bug caught (#1279 item 32): the step on the Calendar still offering the button, or its link opening the step's old
  // month after the DM moved the event on the Calendar.
  it("shows On the Calendar for a step that points at its event, opening the event's month wherever it now is", () => {
    events.current = [{ id: "e1", event_type: "world", title: "Renamed on the Calendar", year: 512, month: 4, day: 9 }];
    const w = mountIt([step({ id: "a", due_year: 512, due_month: 3, due_day: 3, calendar_event_id: "e1" })]);
    expect(w.find("[data-testid=force-step-to-calendar]").exists()).toBe(false);
    expect(w.get("[data-testid=force-step-on-calendar]").attributes("href")).toBe(JSON.stringify({ path: "/calendar", query: { year: "512", month: "4" } }));
  });

  // Bug caught: an event that happens to share the step's title and date taken for the step, which never pointed at it.
  it("does not take an event of the same title and date for the step", () => {
    events.current = [{ id: "e1", event_type: "world", title: "The river runs bitter.", year: 512, month: 3, day: 3 }];
    const w = mountIt([step({ id: "a", title: "The river runs bitter.", due_year: 512, due_month: 3, due_day: 3 })]);
    expect(w.find("[data-testid=force-step-on-calendar]").exists()).toBe(false);
    expect(w.find("[data-testid=force-step-to-calendar]").exists()).toBe(true);
  });

  // Bug caught: the events read for years no step on the Calendar is in (or 0 to 0 for every force).
  it("reads the Calendar for the span of years its steps on the Calendar are due in", () => {
    mountIt([step({ id: "a", due_year: 500, calendar_event_id: "e1" }), step({ id: "b", due_year: 512, calendar_event_id: "e2" }), step({ id: "c", due_year: 530 })]);
    expect(years.asked.at(-1)).toEqual([500, 512]);
  });
});
