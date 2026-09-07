import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
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
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: ref([]) }) }));

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: "new-location" }),
  update: vi.fn().mockResolvedValue({ id: "existing-location" }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocations: () => ({ data: ref([]) }),
  useAllLocations: () => ({ data: ref([]) }),
  useCreateLocation: () => ({ mutateAsync: mocks.create }),
  useUpdateLocation: () => ({ mutateAsync: mocks.update }),
  useUpdateLocationGridCalibration: () => ({ mutateAsync: vi.fn() }),
  useDeleteLocation: () => ({ mutateAsync: vi.fn() }),
  getPinnableDescendants: () => [],
}));

const stubs = {
  EntityEditorActionBar: true,
  EntityImageBlock: true,
  RichTextEditor: true,
  TagInput: true,
  EntityCombobox: true,
  ThemeInput: true,
  CampaignScopeField: true,
  GridCalibrationDialog: true,
  StoreInventory: true,
  LocationHierarchyPanel: true,
  LocationSharingPanel: true,
  LocationResidents: true,
  LocationMapEditor: true,
  AppSelect: true,
  AppInput: true,
  EntityCalendarSection: true,
};

function mountEditor(location: Location | null = null) {
  return shallowMount(LocationEditor, { props: { location }, global: { stubs } });
}

describe("LocationEditor scope default", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.create.mockClear();
    mocks.update.mockClear();
  });

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
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ campaign_id: null }) }),
    );
  });
});
