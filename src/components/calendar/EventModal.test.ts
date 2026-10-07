import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventModal from "./EventModal.vue";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn().mockResolvedValue(undefined),
  updatePartyMember: vi.fn().mockResolvedValue(undefined),
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
  useUpdateCalendarEvent: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useDeleteCalendarEvent: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([]) }),
  useUpdatePartyMember: () => ({ mutateAsync: mocks.updatePartyMember }),
}));
vi.mock("@/composables/notes/useNotes", () => ({ useNote: () => ({ data: ref(null), isLoading: ref(false) }) }));
vi.mock("@/composables/notes/useNoteSession", () => ({ useNoteSession: () => ref(null) }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: vi.fn() }));

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
  mocks.createEvent.mockClear();
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
