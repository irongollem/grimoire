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
  useBeatsStagedAt: () => ({ data: { value: [] } }),
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

describe("AtlasPlacePane header buttons (#958)", () => {
  function labels(w: VueWrapper): string[] {
    return w.findAllComponents(AppButton).map((b) => String(b.props("ariaLabel")));
  }

  it("gives a site Build, Run and Details", async () => {
    const w = mountPane(place({ id: "s", location_type: "dungeon" }));
    await flushPromises();
    expect(labels(w)).toEqual(expect.arrayContaining(["Build", "Run", "Details"]));
    expect(labels(w)).not.toContain("Edit");
  });

  it("gives every other place Build and Details, no Run and no Edit", async () => {
    const w = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(labels(w)).toEqual(expect.arrayContaining(["Build", "Details"]));
    expect(labels(w)).not.toContain("Run");
    expect(labels(w)).not.toContain("Edit");
  });

  it("reads Done while a non-site place is in Build, and forces the Map tab", async () => {
    mocks.query.value = { build: "true" };
    const w = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(labels(w)).toContain("Done");
    expect(w.emitted("update:paneMode")?.[0]).toEqual(["map"]);
  });

  it("offers the Map tab in Build on a place with no map, and not when browsing", async () => {
    const browsing = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(browsing.findComponent({ name: "TabBar" }).exists()).toBe(false);
    browsing.unmount();

    mocks.query.value = { build: "true" };
    const building = mountPane(place({ id: "w", location_type: "region" }));
    await flushPromises();
    expect(building.findComponent({ name: "TabBar" }).exists()).toBe(true);
  });

  it("offers the Map tab in Build on a battle map, which Browse hides", async () => {
    mocks.query.value = { build: "true" };
    const w = mountPane(place({ id: "w", location_type: "region", map_url: "https://x/m.webp", is_battle_map: true }));
    await flushPromises();
    expect(w.findComponent({ name: "TabBar" }).exists()).toBe(true);
  });
});

// The meter's Mapped pill is how a DM finds a site's map from the Overview,
// on a phone above all. Opening it to read must not drop them into Build
// (4 Oct 2026): Build is only where a site with nothing to look at yet goes,
// to start its first layer in the Layers panel.
describe("AtlasPlacePane Mapped pill", () => {
  function openMap(w: VueWrapper) {
    w.findComponent({ name: "SiteReadinessMeter" }).vm.$emit("open-map");
  }

  it("opens a mapped site's Map in Browse", async () => {
    const w = mountPane(place({ id: "s", location_type: "dungeon", map_url: "https://x/m.webp" }));
    await flushPromises();
    openMap(w);
    await flushPromises();
    expect(w.emitted("update:paneMode")?.at(-1)).toEqual(["map"]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("takes a site with no map yet into Build, where the first layer starts", async () => {
    const w = mountPane(place({ id: "s", location_type: "dungeon" }));
    await flushPromises();
    openMap(w);
    await flushPromises();
    expect(w.emitted("update:paneMode")?.at(-1)).toEqual(["map"]);
    expect(mocks.push).toHaveBeenCalledWith({ query: { build: "true" } });
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
