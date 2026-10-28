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
      months: [{ num: 1, name: "One", days: 30 }],
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
    expect(date.props("harptosMonth")).toBe(3);
    expect(wrapper.findComponent({ name: "EventModalTypePicker" }).props("eventType")).toBe("campaign");
  });

  it("lays a prefill over the blank draft when it opens", async () => {
    const wrapper = mountModal({
      prefill: {
        title: "Travel to Daggerford",
        event_type: "travel",
        harptos_year: 1495,
        harptos_month: 1,
        harptos_day: 5,
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
    expect(date.props()).toMatchObject({ harptosMonth: 1, harptosDay: 5, isMultiDay: true, endDay: 8 });
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
  harptos_year: 1495,
  harptos_month: 3,
  harptos_day: 4,
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
    expect(mocks.createEvent.mock.calls[0][0]).toMatchObject({ festival_day: "Midwinter", harptos_month: null, harptos_day: null });

    const w2 = await openModal({ prefill: { title: "Feast", festival_day: "Midwinter" } });
    await submit(w2);
    expect(mocks.createEvent.mock.calls[1][0]).toMatchObject({ festival_day: null, harptos_month: 3, harptos_day: 1 });
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
