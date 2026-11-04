import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EntityCalendarSection from "./EntityCalendarSection.vue";

const base = {
  id: "t",
  name: "T",
  epochName: "TE",
  defaultYear: 1,
  months: [{ num: 1, name: "One", days: 30 }],
  weekSize: 10,
  moons: [],
  seasons: [],
  isLeapYear: () => false,
  formatDate: () => "",
};
const withFestival = { ...base, intercalaryDays: [{ name: "Midwinter", afterMonth: 1, description: "" }] };
const withoutFestival = { ...base, intercalaryDays: [] };

const h = vi.hoisted(() => ({ calendar: null as unknown as { adapter: unknown }, createEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => h.calendar }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useEntityCalendarEvents: () => ({ data: ref([]) }),
  useCreateCalendarEvent: () => ({ mutateAsync: h.createEvent, isPending: ref(false) }),
  useDeleteCalendarEvent: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));

async function openForm() {
  const w = mount(EntityCalendarSection, {
    props: { entityType: "quest", entityId: "q1", entityName: "The Heist" },
    global: { stubs: { RouterLink: true } },
  });
  await w.findAll("button").find((b) => b.text().includes("Pin date"))!.trigger("click");
  return w;
}
const hasToggle = (w: Awaited<ReturnType<typeof openForm>>) => w.findComponent({ name: "SegmentedControl" }).exists();

beforeEach(() => {
  h.createEvent.mockClear();
  h.calendar = reactive({ adapter: withFestival, currentYear: 5, currentMonth: 1 });
});

describe("EntityCalendarSection festival pins", () => {
  // Bug it fails on: a calendar with no festival days still offered "Festival Day",
  // and choosing it pinned festival_day: "" that no grid cell can show.
  it("offers the Regular/Festival choice only when the calendar has festival days", async () => {
    expect(hasToggle(await openForm())).toBe(true);

    h.calendar = reactive({ adapter: withoutFestival, currentYear: 5, currentMonth: 1 });
    expect(hasToggle(await openForm())).toBe(false);
  });

  // Bug it fails on: switching campaign to a festival-less calendar after choosing
  // Festival Day left the date type on festival, so the pin saved festival_day "".
  it("falls back to a regular day when the calendar changes to one without festivals", async () => {
    const w = await openForm();
    const toggle = w.findComponent({ name: "SegmentedControl" });
    toggle.vm.$emit("update:modelValue", "festival");
    await flushPromises();
    expect(w.find("[aria-label='Festival']").exists()).toBe(true);

    (h.calendar as { adapter: unknown }).adapter = withoutFestival;
    await flushPromises();
    expect(w.find("[aria-label='Festival']").exists()).toBe(false);

    await w.findAll("button").find((b) => b.text() === "Pin")!.trigger("click");
    await flushPromises();
    expect(h.createEvent).toHaveBeenCalledTimes(1);
    expect(h.createEvent.mock.calls[0][0]).toMatchObject({ festival_day: null, month: 1, day: 1 });
  });
});
