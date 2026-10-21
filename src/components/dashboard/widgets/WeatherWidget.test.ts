import { mount } from "@vue/test-utils";
import { computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import WeatherWidget from "./WeatherWidget.vue";

const state = vi.hoisted(() => ({
  source: null as null | { climate: string; sourceId: string | null; placeName: string | null; seed: string },
  today: null as null | { weather: unknown; climate: string; sourceId: string | null },
  forecast: [] as unknown[],
  hazards: [] as unknown[],
  isDM: false,
  pin: undefined as undefined | { kind: string },
  setToday: vi.fn(async () => {}),
  rerollToday: vi.fn(async () => {}),
  clearToday: vi.fn(async () => {}),
}));

vi.mock("@/composables/calendar/useTodayWeather", () => ({
  useWeatherSource: () => computed(() => state.source),
  useTodayWeather: () => computed(() => state.today),
  useWeatherForecast: () => computed(() => state.forecast),
  useWeatherHazards: () => computed(() => state.hazards),
}));
vi.mock("@/composables/calendar/useWeatherPins", () => ({
  useWeatherPins: () => ({
    todayPin: computed(() => state.pin),
    pending: computed(() => false),
    setToday: state.setToday,
    rerollToday: state.rerollToday,
    clearToday: state.clearToday,
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: state.isDM }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ todayYear: 12, todayMonth: 3, todayDay: 10 }) }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: gregorianAdapter }) }));

const global = { stubs: { RouterLink: true, CalendarSkyLine: true } };
const weather = { temperature: "mild", precipitation: "rain", wind: "calm", fog: false };

describe("WeatherWidget", () => {
  beforeEach(() => {
    state.source = null;
    state.today = null;
    state.forecast = [];
    state.hazards = [];
    state.isDM = false;
    state.pin = undefined;
    vi.clearAllMocks();
  });

  it("says so when there is no campaign", () => {
    expect(mount(WeatherWidget, { global }).text()).toContain("No campaign selected.");
  });

  it("is calm underground", () => {
    state.source = { climate: "underground", sourceId: "p1", placeName: "Deepdark", seed: "c:p1" };
    expect(mount(WeatherWidget, { global }).text()).toContain("No sky underground.");
  });

  it("names the place and climate, today and the outlook", () => {
    state.source = { climate: "temperate", sourceId: "p1", placeName: "Neverwinter", seed: "c:p1" };
    state.today = { weather, climate: "temperate", sourceId: "p1" };
    state.forecast = [{ date: { year: 12, month: 3, day: 11 }, weather }, { date: { year: 12, month: 3, day: 12 }, weather }];
    const text = mount(WeatherWidget, { global }).text();
    expect(text).toContain("Neverwinter · Temperate");
    expect(text).toContain("Mild, rain, calm");
    expect(text).toContain("Tomorrow");
    expect(text).toContain("12 Mar");
  });

  it("falls back to the campaign climate when no place resolves", () => {
    state.source = { climate: "cold", sourceId: null, placeName: null, seed: "c:campaign" };
    state.today = { weather, climate: "cold", sourceId: null };
    expect(mount(WeatherWidget, { global }).text()).toContain("Campaign climate · Cold");
  });

  it("warns about hazards under today, with the reason", () => {
    state.source = { climate: "cold", sourceId: "p1", placeName: "Frostpeak", seed: "c:p1" };
    state.today = { weather, climate: "cold", sourceId: "p1" };
    state.hazards = [{ kind: "avalanche", level: "high", reason: "three days of heavy snow, now thawing" }];
    const text = mount(WeatherWidget, { global }).text();
    expect(text).toContain("Avalanche risk: high");
    expect(text).toContain("three days of heavy snow, now thawing");
  });

  describe("changing the weather", () => {
    const open = async () => {
      state.source = { climate: "temperate", sourceId: null, placeName: null, seed: "c:campaign" };
      state.today = { weather, climate: "temperate", sourceId: null };
      const wrapper = mount(WeatherWidget, { global });
      await wrapper.findAll("button").find((b) => b.text() === "Change")!.trigger("click");
      return wrapper;
    };

    it("is the DM's alone", () => {
      state.source = { climate: "temperate", sourceId: null, placeName: null, seed: "c:campaign" };
      state.today = { weather, climate: "temperate", sourceId: null };
      expect(mount(WeatherWidget, { global }).text()).not.toContain("Change");
    });

    it("sets, rerolls and clears through the pins composable", async () => {
      state.isDM = true;
      state.pin = { kind: "set" };
      const wrapper = await open();
      expect(wrapper.text()).toContain("set by you");
      const press = (label: string) => wrapper.findAll("button").find((b) => b.text() === label)!.trigger("click");
      await press("Set for today");
      expect(state.setToday).toHaveBeenCalledWith(weather);
      await press("Reroll from today");
      expect(state.rerollToday).toHaveBeenCalled();
      await press("Back to the pattern");
      expect(state.clearToday).toHaveBeenCalled();
    });

    it("only offers weather the climate can produce", async () => {
      state.isDM = true;
      const wrapper = await open();
      const sky = wrapper.find('select[aria-label="Precipitation"]');
      expect(sky.text()).not.toContain("Dust storm");
      expect(sky.text()).not.toContain("Snow");
      await wrapper.find('select[aria-label="Temperature"]').setValue("cold");
      expect(wrapper.find('select[aria-label="Precipitation"]').text()).toContain("Snow");
      expect(wrapper.find('select[aria-label="Precipitation"]').text()).not.toContain("Rain");
    });

    it("hides Back to the pattern when nothing is pinned", async () => {
      state.isDM = true;
      const wrapper = await open();
      expect(wrapper.text()).not.toContain("Back to the pattern");
    });
  });
});
