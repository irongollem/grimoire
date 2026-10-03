import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import LocationEditor from "./LocationEditor.vue";
import type { Location } from "@/types/location.types";

/**
 * #596: a brand-new location used to be forced into the active campaign at
 * the composable level with no way to opt out (`useCreateLocation` always
 * overrode `campaign_id`), so there was no accidental-global bug here the way
 * there was for items/spells/species — but there was also no way for a DM to
 * deliberately make a location available everywhere. Adding that choice back
 * in via CampaignScopeField risked reintroducing the *other* bug this story
 * keeps finding: `props.location?.campaign_id ?? activeCampaignId.value`
 * can't tell "no location yet" apart from "location has no campaign", so it
 * would silently re-scope an existing global location into the active
 * campaign the moment someone opened and saved it. These tests cover the new
 * default (active campaign for a new location, global with no active
 * campaign) and that regression.
 */

const activeCampaignId = ref<string | null>("campaign-1");

// reactive(), not a plain object with a getter: LocationEditor reads this
// store through Pinia's storeToRefs, which only picks up properties that are
// themselves refs/reactive — a plain getter is invisible to it.
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaignId }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { edit: "true", tab: "details" } }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: ref([]) }) }));

// LocationEditor now passes @mention items to its description RichTextEditor
// (epic #932, story 3); mocked at this boundary rather than pulling in the
// five composables useEntityMentionItems fans out to (party/npcs/monsters/
// locations/factions), none of which this file otherwise sets up.
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({ mentionItems: ref([]) }),
}));

const canCreate = ref(true);
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate }) }));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn().mockResolvedValue({ id: "new-location" }),
  update: vi.fn().mockResolvedValue({ id: "existing-location" }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocations: () => ({ data: ref([]) }),
  useAllLocations: () => ({ data: ref([]) }),
  useCreateLocation: () => ({ mutateAsync: mocks.create }),
  useUpdateLocation: () => ({ mutateAsync: mocks.update }),
  useDeleteLocation: () => ({ mutateAsync: vi.fn() }),
}));

const stubs = {
  EntityEditorActionBar: true,
  EntityImageBlock: true,
  RichTextEditor: true,
  TagInput: true,
  EntityCombobox: true,
  ThemeInput: true,
  CampaignScopeField: true,
  LocationHierarchyPanel: true,
  LocationResidents: true,
  AppSelect: true,
  AppInput: true,
  EntityCalendarSection: true,
  PaywallModal: true,
};

function mountEditor(location: Location | null = null) {
  return shallowMount(LocationEditor, { props: { location }, global: { stubs } });
}

describe("LocationEditor scope default", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    activeCampaignId.value = "campaign-1";
    canCreate.value = true;
    mocks.create.mockClear();
    mocks.update.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("creates a new location against the active campaign", async () => {
    const wrapper = mountEditor(null);
    (wrapper.vm as unknown as { name: string }).name = "Tower of the Moon";
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: "campaign-1" }),
    );
  });

  it("creates a global location when there is no active campaign", async () => {
    activeCampaignId.value = null;
    const wrapper = mountEditor(null);
    (wrapper.vm as unknown as { name: string }).name = "Orphaned Keep";
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: null }),
    );
  });

  it("leaves an existing global location's scope alone even with a campaign active", async () => {
    const existing = { id: "loc1", campaign_id: null, name: "The Wandering Inn" } as Location;
    const wrapper = mountEditor(existing);
    (wrapper.vm as unknown as { name: string }).name = "The Wandering Inn II";
    await vi.advanceTimersByTimeAsync(2100);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ campaign_id: null }) }),
    );
  });
});

// Nadia, 23 Sep 2026: a free DM at the 10-location cap reached this editor from
// a path that never checked the quota, filled in a place, and got a bare
// `quota_exceeded` on save — which read as a bug. The cap must say what it is.
describe("LocationEditor at the free-tier cap", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.create.mockReset();
  });

  function paywallOpen(wrapper: ReturnType<typeof mountEditor>): boolean {
    return wrapper.findComponent({ name: "PaywallModal" }).attributes("modelvalue") === "true";
  }

  it("says so on arrival for a new location, before anything is typed", () => {
    canCreate.value = false;
    expect(paywallOpen(mountEditor(null))).toBe(true);
  });

  it("does not interrupt editing an existing location", () => {
    canCreate.value = false;
    const existing = { id: "loc1", campaign_id: "campaign-1", name: "Keep" } as Location;
    expect(paywallOpen(mountEditor(existing))).toBe(false);
  });

  it("turns a refused save into the paywall rather than the raw error", async () => {
    canCreate.value = true;
    mocks.create.mockRejectedValueOnce(new Error("quota_exceeded"));
    const wrapper = mountEditor(null);
    (wrapper.vm as unknown as { name: string }).name = "Eleventh Tower";
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    await wrapper.vm.$nextTick();

    expect(paywallOpen(wrapper)).toBe(true);
    expect((wrapper.vm as unknown as { saveError: string }).saveError).toBe("");
  });
});

// #958: an existing place saves itself and writes only the record. The map,
// who sees the place and what is shared have their own live writers (Build,
// Reveal), so a stale prop here must never be written back over them.
describe("LocationEditor autosave", () => {
  const existing = {
    id: "loc1",
    campaign_id: "campaign-1",
    name: "Keep",
    location_type: "other",
    description: "Old walls",
    player_summary: null,
    tags: [],
    ai_provenance: { source: "ai", edited: false },
    player_visible_to: ["p1"],
    is_map_shared: true,
    map_url: "m.png",
    map_pins: [{ child_location_id: "x" }],
  } as unknown as Location;

  type Vm = { name: string; description: string; tags: string[] };

  beforeEach(() => {
    vi.useFakeTimers();
    canCreate.value = true;
    mocks.update.mockClear();
    mocks.push.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  async function edit(wrapper: ReturnType<typeof mountEditor>, change: (vm: Vm) => void) {
    change(wrapper.vm as unknown as Vm);
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
  }

  function barProp(wrapper: ReturnType<typeof mountEditor>, key: string) {
    return wrapper.findComponent({ name: "EntityEditorActionBar" }).props(key as never);
  }

  it("saves after the debounce with only record fields and does not navigate", async () => {
    const wrapper = mountEditor(existing);
    await edit(wrapper, (vm) => { vm.tags = ["ruin"]; });
    expect(mocks.update).toHaveBeenCalledOnce();
    const sent = mocks.update.mock.calls[0]![0].update as Record<string, unknown>;
    expect(sent.tags).toEqual(["ruin"]);
    for (const key of [
      "player_visible_to", "is_map_shared", "map_url", "map_pins", "is_battle_map",
      "is_description_shared", "is_npcs_shared", "is_inventory_shared",
      "source_map_id", "grid_calibration", "notes",
    ]) expect(sent, key).not.toHaveProperty(key);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("pauses on a blank name and saves nothing", async () => {
    const wrapper = mountEditor(existing);
    await edit(wrapper, (vm) => { vm.name = "  "; });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(barProp(wrapper, "autosave")).toMatchObject({ status: "paused" });
  });

  it("marks provenance edited only when the content changed", async () => {
    const wrapper = mountEditor(existing);
    await edit(wrapper, (vm) => { vm.tags = ["ruin"]; });
    expect(mocks.update.mock.calls[0]![0].update.ai_provenance).toEqual({ source: "ai", edited: false });

    await edit(wrapper, (vm) => { vm.description = "New walls"; });
    expect(mocks.update.mock.calls[1]![0].update.ai_provenance).toMatchObject({ edited: true });
  });

  it("Done leaves edit mode and stays on the place", async () => {
    const wrapper = mountEditor(existing);
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("cancel");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ query: { tab: "details" } });
  });
});
