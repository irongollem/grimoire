import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import SiteLevelAssignment from "./SiteLevelAssignment.vue";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn<(args: { id: string; update: { is_level: boolean } }) => Promise<unknown>>(),
  toastError: vi.fn(),
}));

// `isPending` mirrors CopyToCampaignDialog's own idiom: a genuine ref built
// inside the async factory, since `vi.hoisted` runs before `vue` is
// importable, and the template reads it straight through the `:disabled`
// binding, which only auto-unwraps a real ref.
vi.mock("@/composables/locations/useLocations", async () => {
  const { ref } = await import("vue");
  return { useUpdateLocation: () => ({ mutateAsync: mocks.mutateAsync, isPending: ref(false) }) };
});
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }),
}));

function place(over: Partial<Location> = {}): Location {
  return {
    id: "level-1", user_id: "u", campaign_id: "c", parent_id: "site-1", name: "First Floor",
    location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, map_pins: [], is_map_shared: false,
    player_visible_to: [], player_summary: null, is_description_shared: false,
    is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false,
    grid_calibration: null, map_layer_url: null, map_layer_calibration: null, map_scale: null,
    plan_size: null, era_start: null, era_end: null, audio_theme: null,
    sort_order: null, map_published_rev: null, is_level: false,
    created_at: "", updated_at: "",
    ...over,
  };
}

// Mounted into the real document, matching SegmentedControl's own test idiom —
// its buttons are reka-ui ToggleGroupItems that register focus/roving state
// against the live document.
const mounted: VueWrapper[] = [];
function mountControl(over: Partial<Location> = {}) {
  const w = mount(SiteLevelAssignment, {
    props: { location: place(over), parentName: "Ashmouth Undercroft" },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}

beforeEach(() => {
  mocks.mutateAsync.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});

describe("SiteLevelAssignment", () => {
  it("shows 'a place' as active for a place that isn't flagged a level", () => {
    const w = mountControl({ is_level: false });
    const buttons = w.findAll("button");
    const place = buttons.find((b) => /^a place$/i.test(b.text()));
    const level = buttons.find((b) => b.text() === "A level");
    expect(place?.attributes("data-state")).toBe("on");
    expect(level?.attributes("data-state")).toBe("off");
  });

  it("shows 'a level' as active once the place is flagged", () => {
    const w = mountControl({ is_level: true });
    const buttons = w.findAll("button");
    const place = buttons.find((b) => /^a place$/i.test(b.text()));
    const level = buttons.find((b) => b.text() === "A level");
    expect(level?.attributes("data-state")).toBe("on");
    expect(place?.attributes("data-state")).toBe("off");
  });

  it("saves is_level: true when the DM picks A level", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    const w = mountControl({ is_level: false });
    const level = w.findAll("button").find((b) => b.text() === "A level");
    await level?.trigger("click");
    await flushPromises();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "level-1", update: { is_level: true } });
  });

  it("saves is_level: false when the DM picks the place option", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    const w = mountControl({ is_level: true });
    const place = w.findAll("button").find((b) => /^a place$/i.test(b.text()));
    await place?.trigger("click");
    await flushPromises();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "level-1", update: { is_level: false } });
  });

  it("rolls back the choice and toasts on a failed save", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("nope"));
    const w = mountControl({ is_level: false });
    const level = w.findAll("button").find((b) => b.text() === "A level");
    await level?.trigger("click");
    await flushPromises();

    expect(mocks.toastError).toHaveBeenCalledWith("Error: nope");
    const buttons = w.findAll("button");
    const place = buttons.find((b) => /^a place$/i.test(b.text()));
    const after = buttons.find((b) => b.text() === "A level");
    expect(place?.attributes("data-state")).toBe("on");
    expect(after?.attributes("data-state")).toBe("off");
  });
});
