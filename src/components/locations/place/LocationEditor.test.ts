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
  useRoute: () => ({ query: mocks.query.value }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
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
  del: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
  query: { value: { edit: "true", tab: "details" } as Record<string, string> },
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocations: () => ({ data: ref([]) }),
  useAllLocations: () => ({ data: ref([]) }),
  useCreateLocation: () => ({ mutateAsync: mocks.create }),
  useUpdateLocation: () => ({ mutateAsync: mocks.update }),
  useDeleteLocation: () => ({ mutateAsync: mocks.del }),
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
    // Scope was not touched, so it is not written at all (and certainly not re-scoped).
    const sent = mocks.update.mock.calls[0]![0].update as Record<string, unknown>;
    expect(sent.name).toBe("The Wandering Inn II");
    expect(sent).not.toHaveProperty("campaign_id");
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

  it("sends only the columns that changed, not untouched fields", async () => {
    const wrapper = mountEditor(existing);
    await edit(wrapper, (vm) => { vm.tags = ["ruin"]; });
    expect(mocks.update.mock.calls[0]![0].update).toEqual({ tags: ["ruin"] });
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
    expect(mocks.update.mock.calls[0]![0].update).not.toHaveProperty("ai_provenance");

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

// Post-mutation navigation: a created place lands on itself in the Atlas, a
// cancelled new place goes back to where it was opened from, and a delete goes
// to the parent (or the bare Atlas).
describe("LocationEditor create, cancel and delete", () => {
  type Vm = { name: string; audioTheme: string | null; npcOwnerId: string; playerSummary: string; save: () => Promise<void> };
  beforeEach(() => {
    canCreate.value = true;
    activeCampaignId.value = "campaign-1";
    mocks.create.mockReset().mockResolvedValue({ id: "new-location" });
    mocks.del.mockClear();
    mocks.push.mockClear();
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.query.value = { edit: "true", tab: "details" };
  });

  it("writes nothing for a nameless new place", async () => {
    const vm = mountEditor(null).vm as unknown as Vm;
    vm.name = "   ";
    await vm.save();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("trims the name, turns blanks into nulls, and lands on the new place", async () => {
    const vm = mountEditor(null).vm as unknown as Vm;
    vm.name = "  Tower of the Moon  ";
    vm.audioTheme = "   ";
    vm.npcOwnerId = "";
    vm.playerSummary = "";
    await vm.save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Tower of the Moon", audio_theme: null, npc_owner_id: null, player_summary: null }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/locations?at=new-location");
  });

  it("keeps the ambient theme a DM typed, trimmed", async () => {
    const vm = mountEditor(null).vm as unknown as Vm;
    vm.name = "Tower";
    vm.audioTheme = "  windswept ";
    await vm.save();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ audio_theme: "windswept" }));
  });

  it("shows the failure and stays put when the create fails for another reason", async () => {
    mocks.create.mockRejectedValueOnce(new Error("db is down"));
    const wrapper = mountEditor(null);
    const vm = wrapper.vm as unknown as Vm & { saveError: string };
    vm.name = "Tower";
    await vm.save();
    expect(vm.saveError).toBe("db is down");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("Cancel on a new place returns to the parent it was opened from, or the bare Atlas", async () => {
    mocks.query.value = { parent: "site-9" };
    const withParent = mountEditor(null);
    withParent.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("cancel");
    await flushPromises();
    expect(mocks.push).toHaveBeenLastCalledWith("/locations?at=site-9");

    mocks.query.value = {};
    const bare = mountEditor(null);
    bare.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("cancel");
    await flushPromises();
    expect(mocks.push).toHaveBeenLastCalledWith("/locations");
  });

  it("does not delete when the DM declines the confirmation", async () => {
    mocks.confirm.mockResolvedValue(false);
    const existing = { id: "loc1", campaign_id: "campaign-1", name: "Keep", parent_id: "p1" } as Location;
    mountEditor(existing).findComponent({ name: "EntityEditorActionBar" }).vm.$emit("delete");
    await flushPromises();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("deletes, then goes to the parent place, or to the Atlas for a top-level one", async () => {
    const child = { id: "loc1", campaign_id: "campaign-1", name: "Keep", parent_id: "p1" } as Location;
    mountEditor(child).findComponent({ name: "EntityEditorActionBar" }).vm.$emit("delete");
    await flushPromises();
    expect(mocks.del).toHaveBeenCalledWith("loc1");
    expect(mocks.push).toHaveBeenLastCalledWith("/locations?at=p1");

    const top = { id: "loc2", campaign_id: "campaign-1", name: "World", parent_id: null } as Location;
    mountEditor(top).findComponent({ name: "EntityEditorActionBar" }).vm.$emit("delete");
    await flushPromises();
    expect(mocks.push).toHaveBeenLastCalledWith("/locations");
  });

  it("stays on the place when the delete fails", async () => {
    mocks.del.mockRejectedValueOnce(new Error("no"));
    const existing = { id: "loc1", campaign_id: "campaign-1", name: "Keep", parent_id: "p1" } as Location;
    mountEditor(existing).findComponent({ name: "EntityEditorActionBar" }).vm.$emit("delete");
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("LocationEditor Done with edits that did not save (#958)", () => {
  const existing = { id: "loc1", campaign_id: "campaign-1", name: "Keep", location_type: "other", tags: [] } as unknown as Location;

  beforeEach(() => {
    vi.useFakeTimers();
    canCreate.value = true;
    mocks.update.mockReset();
    mocks.push.mockClear();
    mocks.confirm.mockReset();
    mocks.query.value = { edit: "true", tab: "details" };
  });
  afterEach(() => vi.useRealTimers());

  async function doneAfterFailedEdit() {
    mocks.update.mockRejectedValue(new Error("offline"));
    const wrapper = mountEditor(existing);
    (wrapper.vm as unknown as { tags: string[] }).tags = ["ruin"];
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("cancel");
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
  }

  it("asks before leaving, and stays when the DM says no", async () => {
    mocks.confirm.mockResolvedValue(false);
    await doneAfterFailedEdit();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("The last save failed."), expect.anything());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves, dropping the edits, when the DM confirms", async () => {
    mocks.confirm.mockResolvedValue(true);
    await doneAfterFailedEdit();
    expect(mocks.push).toHaveBeenCalledWith({ query: { tab: "details" } });
  });

  it("does not ask when nothing was edited", async () => {
    const wrapper = mountEditor(existing);
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("cancel");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith({ query: { tab: "details" } });
  });
});
