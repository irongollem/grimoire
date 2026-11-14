import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapMeasurePanel from "./MapMeasurePanel.vue";
import { summarizeRoute, type RoutePoint } from "@/lib/locations/mapRoute";
import type { MapScale } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  updateScale: vi.fn(),
  toastError: vi.fn(),
  party: [] as Array<{ id: string; current_location_id: string | null }>,
  system: "dnd5e-2014",
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocationMapScale: () => ({ mutateAsync: mocks.updateScale, isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: String }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(mocks.party) }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2014") }) }));
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
      moons: [],
      seasons: [],
      isLeapYear: () => false,
      formatDate: () => "",
    },
  }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ todayYear: 1495, todayMonth: 1, todayDay: 5, activeGameSystem: mocks.system }),
}));

const SCALE: MapScale = { unit: "mi", distance: 100, a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } };
const SIZE = { width: 2000, height: 1000 };
const POINTS: RoutePoint[] = [
  { x: 0, y: 0, pin: { id: "loc-a", name: "Waterdeep" } },
  { x: 0.42, y: 0, pin: { id: "loc-b", name: "Daggerford" } },
];

const ScaleDialogStub = {
  name: "MapScaleDialog",
  props: ["open", "mapUrl", "standUrl", "existing", "saving"],
  emits: ["cancel", "save", "clear"],
  template: "<div data-test='scale-dialog' />",
};

const EventModalStub = {
  name: "EventModal",
  props: ["modelValue", "prefill"],
  template: "<div data-test='event-modal' />",
};

function mountPanel(props: Partial<InstanceType<typeof MapMeasurePanel>["$props"]> = {}) {
  return mount(MapMeasurePanel, {
    props: {
      locationId: "place-1",
      mapUrl: "https://cdn.test/map.webp",
      pace: "normal",
      scale: SCALE,
      points: POINTS,
      summary: summarizeRoute(POINTS, SCALE, SIZE, "normal"),
      ...props,
    },
    global: { stubs: { EventModal: EventModalStub, MapScaleDialog: ScaleDialogStub } },
  });
}

beforeEach(() => {
  mocks.updateScale.mockReset().mockResolvedValue({});
  mocks.toastError.mockReset();
  mocks.party = [];
  mocks.system = "dnd5e-2014";
});

describe("MapMeasurePanel", () => {
  // The scale is set right here, on this place's own picture, not in a full-screen editor.
  describe("the scale", () => {
    const dialog = (w: ReturnType<typeof mountPanel>) => w.findComponent({ name: "MapScaleDialog" });
    const press = (w: ReturnType<typeof mountPanel>, label: string) => w.findAll("button").find((b) => b.text() === label)!;

    it("says a scale is needed, and Set scale opens the dialog on this map", async () => {
      const wrapper = mountPanel({ scale: null, summary: null });
      expect(wrapper.text()).toContain("no scale");
      expect(dialog(wrapper).props("open")).toBe(false);
      await press(wrapper, "Set scale").trigger("click");
      expect(dialog(wrapper).props("open")).toBe(true);
      expect(dialog(wrapper).props("mapUrl")).toBe("https://cdn.test/map.webp");
    });

    it("names the scale it measures with, and Edit scale opens the dialog on it", async () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Scale: 100 mi between the two marked points");
      await press(wrapper, "Edit scale").trigger("click");
      expect(dialog(wrapper).props("open")).toBe(true);
      expect(dialog(wrapper).props("existing")).toEqual(SCALE);
    });

    it("writes the scale to this place and closes the dialog", async () => {
      const wrapper = mountPanel({ scale: null, summary: null });
      await press(wrapper, "Set scale").trigger("click");
      dialog(wrapper).vm.$emit("save", SCALE);
      await flushPromises();
      expect(mocks.updateScale).toHaveBeenCalledWith({ id: "place-1", scale: SCALE });
      expect(dialog(wrapper).props("open")).toBe(false);
    });

    it("clears the scale by writing null", async () => {
      const wrapper = mountPanel();
      await press(wrapper, "Edit scale").trigger("click");
      dialog(wrapper).vm.$emit("clear");
      await flushPromises();
      expect(mocks.updateScale).toHaveBeenCalledWith({ id: "place-1", scale: null });
    });

    it("keeps the dialog open, and says why, when the write fails", async () => {
      mocks.updateScale.mockRejectedValue(new Error("denied"));
      const wrapper = mountPanel({ scale: null, summary: null });
      await press(wrapper, "Set scale").trigger("click");
      dialog(wrapper).vm.$emit("save", SCALE);
      await flushPromises();
      expect(dialog(wrapper).props("open")).toBe(true);
      expect(mocks.toastError).toHaveBeenCalledTimes(1);
    });
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

  // #934: the pace effects are 5e rules (PHB 2014 "Travel Pace": a fast pace is -5 to passive Perception).
  it.each([
    ["dnd5e-2014", true],
    ["generic", false],
  ])("quotes the 5e pace effect only where the system has an edition (%s: %s)", (system, quoted) => {
    mocks.system = system;
    const wrapper = mountPanel({ pace: "fast", summary: summarizeRoute(POINTS, SCALE, SIZE, "fast") });
    expect(wrapper.text().includes("passive Wisdom (Perception)")).toBe(quoted);
    expect(wrapper.text()).toContain("30 mi a day"); // the distance still measures
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
      day: 5,
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

  it("names a route that starts or ends on open ground by the end it has", () => {
    const fromOnly: RoutePoint[] = [POINTS[0], { x: 0.4, y: 0, pin: null }];
    expect(mountPanel({ points: fromOnly, summary: summarizeRoute(fromOnly, SCALE, SIZE, "normal") }).text()).toContain("From Waterdeep");
    const toOnly: RoutePoint[] = [{ x: 0, y: 0, pin: null }, POINTS[1]];
    expect(mountPanel({ points: toOnly, summary: summarizeRoute(toOnly, SCALE, SIZE, "normal") }).text()).toContain("To Daggerford");
  });

  it("asks the host to change the pace", async () => {
    const wrapper = mountPanel();
    const fast = wrapper.findAll("button").find((b) => b.text() === "Fast")!;
    await fast.trigger("click");
    expect(wrapper.emitted("update:pace")?.[0]).toEqual(["fast"]);
  });

  it("measures the day length in the map's own unit", () => {
    const km: MapScale = { ...SCALE, unit: "km" };
    const wrapper = mountPanel({ scale: km, summary: summarizeRoute(POINTS, km, SIZE, "normal") });
    expect(wrapper.text()).toContain("km a day");
    expect(wrapper.text()).not.toContain("mi a day");
  });
});
