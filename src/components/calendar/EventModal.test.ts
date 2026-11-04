import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventModal from "./EventModal.vue";
import type { CalendarEvent } from "@/types/calendar.types";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn().mockResolvedValue(undefined),
  updatePartyMember: vi.fn().mockResolvedValue(undefined),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  announce: vi.fn(),
}));

vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({
    currentYear: 1495,
    currentMonth: 3,
    adapter: {
      id: "t",
      name: "T",
      epochName: "TE",
      defaultYear: 1,
      months: [{ num: 1, name: "One", days: 30 }, { num: 2, name: "Two", days: 28 }, { num: 3, name: "Three", days: 31 }],
      intercalaryDays: [],
      weekSize: 10,
      moons: [],
      seasons: [],
      isLeapYear: () => false,
      formatDate: () => "",
    },
  }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "camp-1", isAiEnabled: false }),
}));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCreateCalendarEvent: () => ({ mutateAsync: mocks.createEvent, isPending: ref(false) }),
  useUpdateCalendarEvent: () => ({ mutateAsync: mocks.updateEvent, isPending: ref(false) }),
  useDeleteCalendarEvent: () => ({ mutateAsync: mocks.deleteEvent, isPending: ref(false) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([]) }),
  useUpdatePartyMember: () => ({ mutateAsync: mocks.updatePartyMember }),
}));
vi.mock("@/composables/notes/useNotes", () => ({ useNote: () => ({ data: ref(null), isLoading: ref(false) }) }));
vi.mock("@/composables/notes/useNoteSession", () => ({ useNoteSession: () => ref(null) }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: mocks.announce }));

// Heavy children are stubbed to their props: this is about what the form is
// seeded with, not how it renders.
const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  RichTextEditor: true,
  RichTextViewer: true,
  EventModalTypePicker: true,
  EventModalDatePicker: true,
  EventModalTravelFields: true,
  EventModalAiDraft: true,
  DraftConflictNotice: true,
};

function mountModal(props: Record<string, unknown> = {}) {
  return mount(EventModal, { props: { modelValue: false, ...props }, global: { stubs } });
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockClear();
});

describe("EventModal prefill", () => {
  it("opens a new event on the calendar's own date and type without a prefill", async () => {
    const wrapper = mountModal();
    await wrapper.setProps({ modelValue: true });
    const date = wrapper.findComponent({ name: "EventModalDatePicker" });
    expect(date.props("month")).toBe(3);
    expect(wrapper.findComponent({ name: "EventModalTypePicker" }).props("eventType")).toBe("campaign");
  });

  it("lays a prefill over the blank draft when it opens", async () => {
    const wrapper = mountModal({
      prefill: {
        title: "Travel to Daggerford",
        event_type: "travel",
        year: 1495,
        month: 1,
        day: 5,
        is_multi_day: true,
        end_year: 1495,
        end_month: 1,
        end_day: 8,
        linked_location_id: "loc-b",
        travel_party_member_ids: ["pm-1"],
      },
    });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    expect(wrapper.findComponent({ name: "EventModalTypePicker" }).props("eventType")).toBe("travel");
    const date = wrapper.findComponent({ name: "EventModalDatePicker" });
    expect(date.props()).toMatchObject({ month: 1, day: 5, isMultiDay: true, endDay: 8 });
    const travel = wrapper.findComponent({ name: "EventModalTravelFields" });
    expect(travel.props()).toMatchObject({ linkedLocationId: "loc-b", travelPartyMemberIds: ["pm-1"] });
  });

  it("saves the prefilled event, including what the DM edited", async () => {
    const wrapper = mountModal({
      prefill: { title: "Travel to Daggerford", event_type: "travel", linked_location_id: "loc-b" },
    });
    await wrapper.setProps({ modelValue: true });
    await wrapper.find("input").setValue("Travel to Daggerford, quickly");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Travel to Daggerford, quickly",
        event_type: "travel",
        linked_location_id: "loc-b",
        campaign_id: "camp-1",
      }),
    );
  });
});

const existing: CalendarEvent = {
  id: "ev1",
  user_id: "u1",
  campaign_id: "camp-1",
  title: "Harvest feast",
  description: null,
  event_type: "campaign",
  year: 1495,
  month: 3,
  day: 4,
  festival_day: null,
  is_multi_day: false,
  end_year: null,
  end_month: null,
  end_day: null,
  color: "#000000",
  linked_quest_id: null,
  linked_encounter_id: null,
  linked_location_id: null,
  linked_note_id: null,
  travel_party_member_ids: [],
  player_visible: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

async function openModal(props: Record<string, unknown> = {}) {
  const wrapper = mountModal(props);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  return wrapper;
}
const datePicker = (w: Awaited<ReturnType<typeof openModal>>) => w.findComponent({ name: "EventModalDatePicker" });
async function submit(w: Awaited<ReturnType<typeof openModal>>) {
  await w.find("form").trigger("submit");
  await flushPromises();
}

describe("EventModal saving", () => {
  it("saves a festival date with no month or day, and a regular one with no festival", async () => {
    const w = await openModal({ prefill: { title: "Midwinter" } });
    datePicker(w).vm.$emit("update:dateType", "festival");
    datePicker(w).vm.$emit("update:festivalDay", "Midwinter");
    await flushPromises();
    await submit(w);
    expect(mocks.createEvent.mock.calls[0][0]).toMatchObject({ festival_day: "Midwinter", month: null, day: null });

    const w2 = await openModal({ prefill: { title: "Feast", festival_day: "Midwinter" } });
    await submit(w2);
    expect(mocks.createEvent.mock.calls[1][0]).toMatchObject({ festival_day: null, month: 3, day: 1 });
  });

  it("drops the end date of an event that is not multi-day", async () => {
    const w = await openModal({ prefill: { title: "Short", end_year: 1495, end_month: 2, end_day: 9, is_multi_day: false } });
    await submit(w);
    expect(mocks.createEvent.mock.calls[0][0]).toMatchObject({ end_year: null, end_month: null, end_day: null });

    const w2 = await openModal({ prefill: { title: "Long", end_year: 1495, end_month: 2, end_day: 9, is_multi_day: true } });
    await submit(w2);
    expect(mocks.createEvent.mock.calls[1][0]).toMatchObject({ end_year: 1495, end_month: 2, end_day: 9 });
  });

  it("announces an event to the players only when this save is what shared it", async () => {
    const w = await openModal({ prefill: { title: "Open fair", player_visible: true } });
    await submit(w);
    expect(mocks.announce).toHaveBeenCalledWith("camp-1", expect.stringContaining("Open fair"));

    mocks.announce.mockClear();
    const hidden = await openModal({ prefill: { title: "Secret plot", player_visible: false } });
    await submit(hidden);
    expect(mocks.announce).not.toHaveBeenCalled();

    const already = await openModal({ editEvent: { ...existing, player_visible: true } });
    await already.find("input").setValue("Harvest feast, moved");
    await submit(already);
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it("moves the travelling party to the destination, for a travel event only", async () => {
    const w = await openModal({
      prefill: { title: "To Daggerford", event_type: "travel", linked_location_id: "loc-b", travel_party_member_ids: ["pm-1", "pm-2"] },
    });
    await submit(w);
    expect(mocks.updatePartyMember).toHaveBeenCalledTimes(2);
    expect(mocks.updatePartyMember).toHaveBeenCalledWith({ id: "pm-2", update: { current_location_id: "loc-b" } });

    mocks.updatePartyMember.mockClear();
    const other = await openModal({
      prefill: { title: "Feast", event_type: "campaign", linked_location_id: "loc-b", travel_party_member_ids: ["pm-1"] },
    });
    await submit(other);
    expect(mocks.updatePartyMember).not.toHaveBeenCalled();
  });

  it("sends an edit only the columns that changed, and nothing when nothing changed", async () => {
    const unchanged = await openModal({ editEvent: existing });
    await submit(unchanged);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();

    const edited = await openModal({ editEvent: existing });
    await edited.find("input").setValue("Harvest feast, moved");
    await submit(edited);
    expect(mocks.updateEvent).toHaveBeenCalledWith({ id: "ev1", update: { title: "Harvest feast, moved" } });
  });

  it("deletes the event being edited and closes the dialog", async () => {
    const w = await openModal({ editEvent: existing });
    await w.findAll("button").find((b) => b.text() === "Delete")!.trigger("click");
    await flushPromises();
    expect(mocks.deleteEvent).toHaveBeenCalledWith("ev1");
    expect(w.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });
});

describe("EventModal day limit", () => {
  // Bug it fails on: the day input was capped at a flat 30 whatever the month's length.
  it("caps the day at the chosen month's own length, for the start and the end date", async () => {
    const w = await openModal({ prefill: { title: "Feast" } });
    expect(datePicker(w).props("dayMax")).toBe(31); // month 3 of the mocked calendar
    datePicker(w).vm.$emit("update:month", 2);
    await flushPromises();
    expect(datePicker(w).props("dayMax")).toBe(28);
    datePicker(w).vm.$emit("update:endMonth", 1);
    await flushPromises();
    expect(datePicker(w).props("endDayMax")).toBe(30);
  });
});

describe("EventModal day clamp", () => {
  // Bug it fails on: day 31 stayed in the form after the month changed to a 28-day
  // one, so the input's max blocked the save with no hint of which field was wrong.
  it("takes the new month's last day when the chosen day does not exist there", async () => {
    const w = await openModal({ prefill: { title: "Feast", month: 3, day: 31 } });
    expect(datePicker(w).props("day")).toBe(31); // Three has 31 days: left alone
    datePicker(w).vm.$emit("update:month", 2);
    await flushPromises();
    expect(datePicker(w).props("day")).toBe(28);
    await submit(w);
    expect(mocks.createEvent.mock.calls[0][0]).toMatchObject({ month: 2, day: 28 });
  });

  it("leaves a day that still fits when the month changes", async () => {
    const w = await openModal({ prefill: { title: "Feast", month: 3, day: 12 } });
    datePicker(w).vm.$emit("update:month", 2);
    await flushPromises();
    expect(datePicker(w).props("day")).toBe(12);
  });

  // Bug it fails on: the same, for the end date of a multi-day event.
  it("clamps the end day when the end month changes to a shorter one", async () => {
    const w = await openModal({
      prefill: { title: "Siege", month: 3, day: 1, is_multi_day: true, end_year: 1495, end_month: 3, end_day: 31 },
    });
    expect(datePicker(w).props("endDay")).toBe(31);
    datePicker(w).vm.$emit("update:endMonth", 2);
    await flushPromises();
    expect(datePicker(w).props("endDay")).toBe(28);
  });
});
