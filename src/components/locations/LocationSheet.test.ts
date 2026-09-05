import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, RouterLinkStub, type VueWrapper } from "@vue/test-utils";
import { ref, reactive } from "vue";
import LocationSheet from "./LocationSheet.vue";
import type { Location } from "@/types/location.types";

/**
 * The deletion this story makes (#790 item 4): while a session is running,
 * opening a location sheet is browsing, not travelling, and must not touch
 * the ambient slot at all — that is `usePartyAmbience`'s job now. With no
 * session running, the sheet's own prep-time preview is unchanged.
 */

const sessionRunning = ref(false);

// Plain `{ value }` boxes rather than real `ref()`s: `vi.hoisted` runs before
// any module — "vue" included — has finished evaluating, so calling `ref()`
// in here throws. These tests never mutate the lists mid-render, so a real
// reactive ref buys nothing.
const mocks = vi.hoisted(() => ({
  requestAudioTheme: vi.fn(),
  releaseAudioTheme: vi.fn(),
  allLocations: { data: { value: [] as Location[] } },
  children: { data: { value: [] as Location[] } },
  deleteLocation: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({ useUiStore: () => reactive({ sessionRunning }) }));
vi.mock("@/lib/audio/audioTriggers", () => ({
  requestAudioTheme: mocks.requestAudioTheme,
  releaseAudioTheme: mocks.releaseAudioTheme,
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => mocks.allLocations,
  useLocations: () => mocks.children,
  useDeleteLocation: () => ({ mutateAsync: mocks.deleteLocation }),
  getPinnableDescendants: () => [],
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: { value: [] } }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

function place(over: Partial<Location> & { id: string }): Location {
  return {
    user_id: "u", campaign_id: "c", parent_id: null, name: over.id,
    location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, map_pins: [], is_map_shared: false,
    player_visible_to: [], player_summary: null, is_description_shared: false,
    is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false,
    grid_calibration: null, era_start: null, era_end: null,
    audio_theme: null, sort_order: null, created_at: "", updated_at: "",
    ...over,
  } as Location;
}

const stubs = {
  RouterLink: RouterLinkStub,
  FocalImage: true,
  AppButton: true,
  LocationMap: true,
  LocationDetailSections: true,
  LocationRevealControl: true,
};

// `sessionRunning` is shared module state, so a wrapper left mounted across
// tests would keep reacting to a later test's mutations of it. Every test
// mounts through this so `afterEach` can always tear the instance down.
let wrapper: VueWrapper | null = null;
function mountSheet(loc: Location): VueWrapper {
  wrapper = mount(LocationSheet, { props: { location: loc }, global: { stubs } });
  return wrapper;
}

beforeEach(() => {
  sessionRunning.value = false;
  mocks.requestAudioTheme.mockClear();
  mocks.releaseAudioTheme.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe("LocationSheet ambient audio", () => {
  it("previews the room's theme when no session is running (unchanged)", async () => {
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    mountSheet(loc);
    await flushPromises();

    expect(mocks.requestAudioTheme).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "location:l1", theme: "tavern", slot: "ambient", label: "The Yawning Portal", kind: "location",
    }));
  });

  it("releases its preview on unmount when no session is running (unchanged)", async () => {
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    mountSheet(loc);
    await flushPromises();

    wrapper?.unmount();

    expect(mocks.releaseAudioTheme).toHaveBeenCalledWith("location:l1");
  });

  it("never requests ambience while a session is running", async () => {
    sessionRunning.value = true;
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    mountSheet(loc);
    await flushPromises();

    expect(mocks.requestAudioTheme).not.toHaveBeenCalled();
  });

  // The edge case a plain guard-on-mount would miss: the DM already had the
  // sheet open, previewing this location, when a session started. The slot
  // must be handed to the party immediately rather than left on whatever the
  // DM was last browsing.
  it("hands its preview back the moment a session starts mid-browse", async () => {
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    mountSheet(loc);
    await flushPromises();
    expect(mocks.requestAudioTheme).toHaveBeenCalledTimes(1);

    sessionRunning.value = true;
    await flushPromises();

    expect(mocks.releaseAudioTheme).toHaveBeenCalledWith("location:l1");
  });

  it("resumes its preview once the session ends", async () => {
    sessionRunning.value = true;
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    mountSheet(loc);
    await flushPromises();
    expect(mocks.requestAudioTheme).not.toHaveBeenCalled();

    sessionRunning.value = false;
    await flushPromises();

    expect(mocks.requestAudioTheme).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "location:l1" }));
  });
});
