import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import SpeciesDetail from "./SpeciesDetail.vue";
import type { Species } from "@/types/species.types";

/**
 * #596: a brand-new species used to default to `campaign_id: null` ("every
 * campaign") no matter which campaign the DM was looking at — the hand-rolled
 * "Campaign-only" checkbox this component used to have only ever *added* a
 * scope, it never started with one. These tests cover the flipped default:
 * new species land in the active campaign, no active campaign is a genuine
 * global case, and editing an existing species never touches its stored scope.
 */

const activeCampaignId = ref<string | null>("campaign-1");

// `reactive()`, not a plain object with a getter: SpeciesDetail reads this
// store through Pinia's `storeToRefs`, which only picks up properties that
// are themselves refs/reactive (or `.effect`-bearing computeds) — a plain
// getter is invisible to it and silently comes back `undefined`. Wrapping the
// ref in `reactive()` reproduces the auto-unwrap a real Pinia store gives you.
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaignId, activeCampaign: { name: "Test Campaign" } }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: "new-species" }),
  update: vi.fn().mockResolvedValue({ id: "existing-species" }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({
  useCreateSpecies: () => ({ mutateAsync: mocks.create }),
  useUpdateSpecies: () => ({ mutateAsync: mocks.update }),
  useDeleteSpecies: () => ({ mutate: vi.fn() }),
}));

const stubs = {
  EntityImageBlock: true,
  AppCheckbox: true,
  CampaignScopeField: true,
  TagInput: true,
  TraitSection: true,
  SpeciesSpellGrants: true,
  AppButton: true,
  AppInput: true,
  AppSelect: true,
  RichTextEditor: true,
};

function mountDetail(species: Species | null = null) {
  return shallowMount(SpeciesDetail, { props: { species }, global: { stubs } });
}

describe("SpeciesDetail scope default", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.create.mockClear();
    mocks.update.mockClear();
  });

  it("creates a new species against the active campaign", async () => {
    const wrapper = mountDetail(null);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: "campaign-1" }),
    );
  });

  it("creates a global species when there is no active campaign", async () => {
    activeCampaignId.value = null;
    const wrapper = mountDetail(null);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: null }),
    );
  });

  it("leaves an existing global species' scope alone even with a campaign active", async () => {
    const existing = { id: "s1", campaign_id: null, name: "Owlfolk" } as Species;
    const wrapper = mountDetail(existing);
    // The scope shown to the DM is the species' own stored value, not a
    // recomputed default — editing must never silently move existing content
    // into whichever campaign happens to be active.
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ campaign_id: null }) }),
    );
  });
});
