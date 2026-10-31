import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AtlasPlacePane from "./AtlasPlacePane.vue";
import { buildAtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

/**
 * The ambience button moved here from the old full-page `LocationSheet`
 * (deleted 25 Sep 2026 — the Atlas is a place's only DM screen now). A place
 * never starts its own sound; it offers "Play ambience", and what that
 * starts outlives the pane — the DM selects another place, or leaves the
 * Atlas, while the room is still where everything is happening. The playing
 * itself is `useAmbiencePlayback`'s own behaviour (tested there); this
 * covers what the pane offers, mirroring the coverage `LocationSheet.test.ts`
 * used to carry.
 */

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  answered: { value: true },
  query: { value: {} as Record<string, string> },
  push: vi.fn(),
  staged: { value: [] as { quest_id: string }[] },
}));

const playingOwner = ref<string | null>(null);
vi.mock("@/composables/locations/useAmbiencePlayback", () => ({
  useAmbiencePlayback: () => ({
    targetFor: (theme: string) => (mocks.answered.value ? { playlistId: `${theme}-scene` } : null),
    isPlaying: (themeOwnerId: string) => playingOwner.value === themeOwnerId,
    play: (next: { themeOwnerId: string }) => {
      mocks.play(next);
      playingOwner.value = next.themeOwnerId;
    },
    stop: () => {
      mocks.stop();
      playingOwner.value = null;
    },
  }),
}));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({
    readiness: { value: { mapped: false, calibrated: false, traced: false, bound: false, waysOut: false } },
  }),
}));
vi.mock("@/composables/quests/useBeatsStagedAt", () => ({
  useBeatsStagedAt: () => ({ data: { get value() { return mocks.staged.value; } } }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ query: mocks.query.value }),
  useRouter: () => ({ push: mocks.push }),
}));

function place(over: Partial<Location> & { id: string }): Location {
  return {
    user_id: "u", campaign_id: "c", parent_id: null, name: over.id,
    location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, map_pins: [], is_map_shared: false,
    player_visible_to: [], player_summary: null, is_description_shared: false,
    is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false,
    grid_calibration: null, map_layer_url: null, map_layer_calibration: null,
    plan_size: null, era_start: null, era_end: null, audio_theme: null,
    sort_order: null, map_published_rev: null, is_level: false,
    created_at: "", updated_at: "",
    ...over,
  } as Location;
}

const stubs = {
  FocalImage: true,
  AppButton: true,
  AtlasScaleRail: true,
  AtlasSiteMapMode: true,
  AtlasTreeRow: true,
  LocationDetailSections: true,
  LocationRevealControl: true,
  AtlasSiteLayerBar: true,
  SiteReadinessMeter: true,
  TabBar: true,
  DmNoteBox: true,
  PlaceMapEmpty: true,
};

// Every test mounts through this so `afterEach` can always tear it down.
let wrapper: VueWrapper | null = null;
function mountPane(loc: Location, all: Location[] = [loc]): VueWrapper {
  wrapper = mount(AtlasPlacePane, {
    props: {
      index: buildAtlasIndex(all),
      location: loc,
      paneMode: "places",
      todayYear: 1000,
    },
    global: { stubs },
  });
  return wrapper;
}

beforeEach(() => {
  playingOwner.value = null;
  mocks.play.mockClear();
  mocks.stop.mockClear();
  mocks.answered.value = true;
  mocks.query.value = {};
  mocks.push.mockClear();
  mocks.staged.value = [];
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe("AtlasPlacePane ambient audio", () => {
  function ambienceButton(w: VueWrapper) {
    return w.findAllComponents(AppButton).find((b) => /ambience/i.test(String(b.props("ariaLabel"))));
  }

  it("opens silent, offering to play the room's theme", async () => {
    const w = mountPane(place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" }));
    await flushPromises();

    expect(mocks.play).not.toHaveBeenCalled();
    expect(ambienceButton(w)?.props("ariaLabel")).toBe("Play ambience");
  });

  it("plays on the first press and stops on the second", async () => {
    const w = mountPane(place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" }));
    await flushPromises();

    ambienceButton(w)!.vm.$emit("click");
    await flushPromises();
    expect(mocks.play).toHaveBeenCalledWith({ themeOwnerId: "l1", theme: "tavern", label: "The Yawning Portal" });
    expect(ambienceButton(w)?.props("ariaLabel")).toBe("Stop ambience");

    ambienceButton(w)!.vm.$emit("click");
    await flushPromises();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(ambienceButton(w)?.props("ariaLabel")).toBe("Play ambience");
  });

  // #868: a themeless room plays what the party would actually hear there.
  it("plays the nearest themed ancestor's theme, owned by the ancestor", async () => {
    const site = place({ id: "site", name: "Ashmouth Undercroft", audio_theme: "dungeon-wet" });
    const room = place({ id: "room", name: "Gatehouse Stair", parent_id: "site", audio_theme: null });
    const w = mountPane(room, [site, room]);
    await flushPromises();

    ambienceButton(w)!.vm.$emit("click");
    await flushPromises();
    expect(mocks.play).toHaveBeenCalledWith({ themeOwnerId: "site", theme: "dungeon-wet", label: "Gatehouse Stair" });
  });

  it("offers nothing for a room that is deliberately silent", async () => {
    const w = mountPane(place({ id: "l1", name: "Abbot's Cell", audio_theme: "silence" }));
    await flushPromises();

    expect(ambienceButton(w)).toBeUndefined();
  });

  it("offers nothing when the soundboard has no scene for the theme yet", async () => {
    mocks.answered.value = false;
    const w = mountPane(place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" }));
    await flushPromises();

    expect(ambienceButton(w)).toBeUndefined();
  });
});

// #1125 decision 1: Build is retired. A place has Reveal, ambience, Explore (a
// site's alone) and Details, and two tabs, Overview and Map, always.
describe("AtlasPlacePane header buttons (#1125)", () => {
  function labels(w: VueWrapper): string[] {
    return w.findAllComponents(AppButton).map((b) => String(b.props("ariaLabel")));
  }

  it("gives a site Explore and Details, and no Build or Run", async () => {
    const w = mountPane(place({ id: "s", location_type: "dungeon" }));
    await flushPromises();
    expect(labels(w)).toEqual(expect.arrayContaining(["Explore", "Details"]));
    expect(labels(w)).not.toContain("Build");
    expect(labels(w)).not.toContain("Run");
    expect(labels(w)).not.toContain("Done");
  });

  it("gives every other place Details alone", async () => {
    const w = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(labels(w)).toContain("Details");
    expect(labels(w)).not.toContain("Explore");
    expect(labels(w)).not.toContain("Build");
  });

  it("ignores a stray ?build=true from an old link: no Done, and the tab is not forced", async () => {
    mocks.query.value = { build: "true" };
    const w = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(labels(w)).not.toContain("Done");
    expect(w.emitted("update:paneMode")).toBeUndefined();
  });

  it("shows the Overview and Map tabs on a place with no map, and on a battle map", async () => {
    const mapless = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(mapless.findComponent({ name: "TabBar" }).exists()).toBe(true);
    mapless.unmount();

    const battle = mountPane(place({ id: "b", location_type: "region", map_url: "https://x/m.webp", is_battle_map: true }));
    await flushPromises();
    expect(battle.findComponent({ name: "TabBar" }).exists()).toBe(true);
  });

  it("opens Details and Explore as flags on the same selection", async () => {
    mocks.query.value = { at: "s" };
    const w = mountPane(place({ id: "s", location_type: "dungeon" }));
    await flushPromises();
    const press = (label: string) => w.findAllComponents(AppButton).find((b) => b.props("ariaLabel") === label)!.vm.$emit("click");
    press("Details");
    press("Explore");
    expect(mocks.push).toHaveBeenNthCalledWith(1, { query: { at: "s", edit: "true" } });
    expect(mocks.push).toHaveBeenNthCalledWith(2, { query: { at: "s", run: "true" } });
  });
});

// The meter's Mapped pill is how a DM finds a site's map from the Overview,
// on a phone above all. It only ever opens the Map tab (#1125): a map to read,
// or the empty card that starts one. It never navigates.
describe("AtlasPlacePane Mapped pill", () => {
  function openMap(w: VueWrapper) {
    w.findComponent({ name: "SiteReadinessMeter" }).vm.$emit("open-map");
  }

  it.each([
    ["a mapped site", { map_url: "https://x/m.webp" }],
    ["a site with no map yet", {}],
  ])("opens the Map tab for %s without leaving the page", async (_name, over) => {
    const w = mountPane(place({ id: "s", location_type: "dungeon", ...over }));
    await flushPromises();
    openMap(w);
    await flushPromises();
    expect(w.emitted("update:paneMode")?.at(-1)).toEqual(["map"]);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("AtlasPlacePane DM note (#983)", () => {
  it("mounts one DM note box for the selected place", async () => {
    const w = mountPane(place({ id: "p1", name: "Ashmouth", location_type: "city" }));
    await flushPromises();
    const box = w.findComponent({ name: "DmNoteBox" });
    expect(box.exists()).toBe(true);
    expect(box.attributes("type")).toBe("location");
    expect(box.attributes("id")).toBe("p1");
  });
});

describe("AtlasPlacePane Overview and Map (#1125)", () => {
  const site = (over: Partial<Location> & { id: string }) => place({ location_type: "dungeon", ...over });

  it("holds no level assignment: that lives in the Details form", async () => {
    const parent = site({ id: "up" });
    const child = site({ id: "down", parent_id: "up" });
    const w = mountPane(child, [parent, child]);
    await flushPromises();
    expect(w.findComponent({ name: "SiteLevelAssignment" }).exists()).toBe(false);
  });

  it("shows the readiness meter on a site's Overview and not on its Map", async () => {
    const loc = site({ id: "s", map_url: "https://x/m.webp" });
    const w = mountPane(loc);
    await flushPromises();
    expect(w.findComponent({ name: "SiteReadinessMeter" }).exists()).toBe(true);
    await w.setProps({ paneMode: "map" });
    expect(w.findComponent({ name: "SiteReadinessMeter" }).exists()).toBe(false);
    expect(w.findComponent({ name: "AtlasSiteMapMode" }).exists()).toBe(true);
    expect(w.findComponent({ name: "LocationDetailSections" }).exists()).toBe(false);
  });

  it("shows a mapped place's map on its Map tab, with no empty card", async () => {
    const w = mountPane(place({ id: "w", location_type: "region", map_url: "https://x/m.webp" }));
    await w.setProps({ paneMode: "map" });
    expect(w.findComponent({ name: "AtlasSiteMapMode" }).exists()).toBe(true);
    expect(w.findComponent({ name: "PlaceMapEmpty" }).exists()).toBe(false);
  });

  it("shows the empty card, told whether the place is a site, on a place with no map", async () => {
    const w = mountPane(site({ id: "s" }));
    await w.setProps({ paneMode: "map" });
    const empty = w.findComponent({ name: "PlaceMapEmpty" });
    expect(empty.exists()).toBe(true);
    expect(empty.props("isSite")).toBe(true);
    expect(w.findComponent({ name: "AtlasSiteMapMode" }).exists()).toBe(false);

    const town = mountPane(place({ id: "t", location_type: "city" }));
    await town.setProps({ paneMode: "map" });
    expect(town.findComponent({ name: "PlaceMapEmpty" }).props("isSite")).toBe(false);
  });

  it("treats a battle map as no map in the Atlas: the empty card, not the map", async () => {
    const w = mountPane(place({ id: "b", location_type: "region", map_url: "https://x/m.webp", is_battle_map: true }));
    await w.setProps({ paneMode: "map" });
    expect(w.findComponent({ name: "PlaceMapEmpty" }).exists()).toBe(true);
    expect(w.findComponent({ name: "AtlasSiteMapMode" }).exists()).toBe(false);
  });

  it("offers the Map tab from a thumbnail card on the Overview of a mapped place", async () => {
    const w = mountPane(place({ id: "w", location_type: "region", map_url: "https://x/m.webp" }));
    await flushPromises();
    const open = w.findAllComponents(AppButton).find((b) => b.props("label") === "Open the map tab")!;
    open.vm.$emit("click");
    expect(w.emitted("update:paneMode")?.at(-1)).toEqual(["map"]);
  });

  it("offers no thumbnail card on a place with no map", async () => {
    const w = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(w.findAllComponents(AppButton).some((b) => b.props("label") === "Open the map tab")).toBe(false);
  });
});

describe("AtlasPlacePane header facts", () => {
  it("counts the quests staged here once each, and says nothing at zero", async () => {
    const quiet = mountPane(place({ id: "p" }));
    await flushPromises();
    expect(quiet.text()).not.toContain("staged here");
    quiet.unmount();

    mocks.staged.value = [{ quest_id: "q1" }];
    const one = mountPane(place({ id: "p" }));
    await flushPromises();
    expect(one.text()).toContain("1 quest staged here");
    one.unmount();

    mocks.staged.value = [{ quest_id: "q1" }, { quest_id: "q1" }, { quest_id: "q2" }];
    const two = mountPane(place({ id: "p" }));
    await flushPromises();
    expect(two.text()).toContain("2 quests staged here");
  });

  it("names the era only when the place is out of it", async () => {
    const inEra = mountPane(place({ id: "p", era_start: 900, era_end: 1100 }));
    await flushPromises();
    expect(inEra.text()).not.toContain("900");
    inEra.unmount();

    const gone = mountPane(place({ id: "p", era_start: 100, era_end: 200 }));
    await flushPromises();
    expect(gone.text()).toContain("100–200");
  });

  it("says how many levels a site stacks, from the site itself and not from a floor", async () => {
    const top = place({ id: "top", location_type: "dungeon" });
    const low = place({ id: "low", location_type: "dungeon", parent_id: "top", is_level: true });
    const onTop = mountPane(top, [top, low]);
    await flushPromises();
    expect(onTop.text()).toContain("2 levels");
    onTop.unmount();
    const onLow = mountPane(low, [top, low]);
    await flushPromises();
    expect(onLow.text()).not.toContain("levels");
  });

  it("leaves a site's rooms out of the scale groups, since its rooms panel lists them", async () => {
    const top = place({ id: "top", location_type: "dungeon" });
    const room = place({ id: "r1", location_type: "room", parent_id: "top" });
    const sub = place({ id: "s1", location_type: "dungeon", parent_id: "top" });
    const w = mountPane(top, [top, room, sub]);
    await flushPromises();
    expect(w.findAllComponents({ name: "AtlasTreeRow" }).map((r) => r.props("row").loc.id)).toEqual(["s1"]);
  });
});
