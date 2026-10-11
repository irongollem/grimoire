import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapMeasurePanel from "./MapMeasurePanel.vue";
import { summarizeRoute, type RoutePoint } from "@/lib/locations/mapRoute";
import type { MapScale } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  party: [] as Array<{ id: string; current_location_id: string | null }>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { at: "place-1" } }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(mocks.party) }) }));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({
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
  useCampaignStore: () => ({ todayYear: 1495, todayMonth: 1, todayDay: 5 }),
}));

const SCALE: MapScale = { unit: "mi", distance: 100, a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } };
const SIZE = { width: 2000, height: 1000 };
const POINTS: RoutePoint[] = [
  { x: 0, y: 0, pin: { id: "loc-a", name: "Waterdeep" } },
  { x: 0.42, y: 0, pin: { id: "loc-b", name: "Daggerford" } },
];

const EventModalStub = {
  name: "EventModal",
  props: ["modelValue", "prefill"],
  template: "<div data-test='event-modal' />",
};

function mountPanel(props: Partial<InstanceType<typeof MapMeasurePanel>["$props"]> = {}) {
  return mount(MapMeasurePanel, {
    props: {
      pace: "normal",
      scale: SCALE,
      points: POINTS,
      summary: summarizeRoute(POINTS, SCALE, SIZE, "normal"),
      ...props,
    },
    global: { stubs: { EventModal: EventModalStub } },
  });
}

beforeEach(() => {
  mocks.push.mockClear();
  mocks.party = [];
});

describe("MapMeasurePanel", () => {
  it("says a scale is needed, and opens Build to set one", async () => {
    const wrapper = mountPanel({ scale: null, summary: null });
    expect(wrapper.text()).toContain("no scale");
    await wrapper.findAll("button").find((b) => b.text() === "Open Build")!.trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({ query: { at: "place-1", build: "true" } });
  });

  it("prompts for the first tap on an empty route", () => {
    const wrapper = mountPanel({ points: [], summary: null });
    expect(wrapper.text()).toContain("Tap the map to start a route");
    const add = wrapper.findAll("button").find((b) => b.text() === "Add to calendar")!;
    expect(add.attributes("disabled")).toBeDefined();
  });

  it("shows distance, time and the pace's day length", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("84 mi");
    expect(wrapper.text()).toContain("3 days, 4 hours");
    expect(wrapper.text()).toContain("Waterdeep to Daggerford");
    expect(wrapper.text()).toContain("24 mi a day, 8 travel hours a day");
  });

  it("reports undo, clear and close", async () => {
    const wrapper = mountPanel();
    const click = (label: string) => wrapper.findAll("button").find((b) => b.text() === label)!.trigger("click");
    await click("Undo");
    await click("Clear");
    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("clear")).toHaveLength(1);
  });

  it("opens the event modal prefilled with the route and the travellers at the origin", async () => {
    mocks.party = [
      { id: "pm-1", current_location_id: "loc-a" },
      { id: "pm-2", current_location_id: "elsewhere" },
    ];
    const wrapper = mountPanel();
    await wrapper.findAll("button").find((b) => b.text() === "Add to calendar")!.trigger("click");
    const modal = wrapper.findComponent({ name: "EventModal" });
    expect(modal.props("modelValue")).toBe(true);
    expect(modal.props("prefill")).toMatchObject({
      event_type: "travel",
      title: "Travel to Daggerford",
      harptos_day: 5,
      is_multi_day: true,
      end_day: 8,
      linked_location_id: "loc-b",
      travel_party_member_ids: ["pm-1"],
    });
    expect(String(modal.props("prefill").description)).toContain("84 mi from Waterdeep to Daggerford at a normal pace");
  });

  it("prefills no travellers when the route starts on open ground", async () => {
    mocks.party = [{ id: "pm-1", current_location_id: "loc-a" }];
    const points: RoutePoint[] = [{ x: 0, y: 0, pin: null }, POINTS[1]];
    const wrapper = mountPanel({ points, summary: summarizeRoute(points, SCALE, SIZE, "normal") });
    await wrapper.findAll("button").find((b) => b.text() === "Add to calendar")!.trigger("click");
    expect(wrapper.findComponent({ name: "EventModal" }).props("prefill")).toMatchObject({ travel_party_member_ids: [] });
  });
});
