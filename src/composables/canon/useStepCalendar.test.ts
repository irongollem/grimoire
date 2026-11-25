import { describe, expect, it, vi } from "vitest";
import { ref, unref, type Ref } from "vue";
import type { CanonEntry, CanonForceStep } from "@/types/canon.types";

const calls = vi.hoisted(() => ({ range: [] as { from: Ref<number>; to: Ref<number>; wanted: Ref<boolean> }[] }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCalendarEventsRange: (from: Ref<number>, to: Ref<number>, wanted: Ref<boolean>) => {
    calls.range.push({ from, to, wanted });
    return { data: ref([]) };
  },
  useCreateCalendarEvent: () => ({ mutateAsync: vi.fn() }),
  useDeleteCalendarEvent: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/canon/useCanonForces", () => ({ updateForceStep: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), fromError: String } }));

import { useStepCalendar } from "@/composables/canon/useStepCalendar";

const force = { id: "f1", campaign_id: "c1", title: "The Gold Voice" } as CanonEntry;
const step = (over: Partial<CanonForceStep>) => ({ id: "s1", force_id: "f1", title: "A step", calendar_event_id: null, due_year: null, due_month: null, due_day: null, ...over }) as CanonForceStep;

describe("useStepCalendar", () => {
  // Bug caught (#1279 review): a force with no step on the Calendar still read the Calendar for year 0, on every force
  // pane and every doorbell refetch, for a range that can only come back empty.
  it("reads the Calendar only when a step on it has a year, over the years they are due", () => {
    calls.range.length = 0;
    const steps = ref<CanonForceStep[]>([step({})]);
    useStepCalendar(() => force, () => steps.value);
    const read = calls.range[0]!;
    expect(unref(read.wanted)).toBe(false);
    steps.value = [step({ calendar_event_id: "e1", due_year: 1452 }), step({ id: "s2", calendar_event_id: "e2", due_year: 1455 })];
    expect([unref(read.wanted), unref(read.from), unref(read.to)]).toEqual([true, 1452, 1455]);
  });
});
