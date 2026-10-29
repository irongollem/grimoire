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
    const existing = { id: "s1", campaign_id: null, name: "Owlfolk", speed: { walk: 30 } } as Species;
    const wrapper = mountDetail(existing);
    // The scope shown to the DM is the species' own stored value, not a
    // recomputed default — editing must never silently move existing content
    // into whichever campaign happens to be active.
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ campaign_id: null }) }),
    );
  });

  it("never sends a notes column; the DM note lives on the page's DmNoteBox", async () => {
    const wrapper = mountDetail({ id: "s1", campaign_id: null, name: "Owlfolk", speed: { walk: 30 } } as Species);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update.mock.calls[0][0].update).not.toHaveProperty("notes");
  });

  it("starts a new species at walk 30", async () => {
    const wrapper = mountDetail(null);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create.mock.calls[0][0].speed).toEqual({ walk: 30 });
  });

  it("round-trips a subrace's size, speed and languages and omits empty ones", async () => {
    const wrapper = mountDetail({
      id: "s1",
      campaign_id: null,
      name: "Gnome",
      speed: { walk: 30 },
      subraces: [
        { name: "Deep", description: "", traits: [], size: "small", speed: { walk: 25, swim: 20 }, languages: ["Undercommon"] },
        { name: "Rock", description: "", traits: [] },
      ],
    } as unknown as Species);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    const subraces = mocks.update.mock.calls[0][0].update.subraces;
    expect(subraces[0]).toMatchObject({ size: "small", speed: { walk: 25, swim: 20 }, languages: ["Undercommon"] });
    expect(subraces[1]).not.toHaveProperty("size");
    expect(subraces[1]).not.toHaveProperty("speed");
    expect(subraces[1]).not.toHaveProperty("languages");
  });

  it("blocks the save and says why when nothing gives a walking speed", async () => {
    const wrapper = mountDetail({
      id: "s1",
      campaign_id: null,
      name: "Wisp",
      speed: { fly: 30 },
      subraces: [
        { name: "A", description: "", traits: [], speed: { walk: 25 } },
        { name: "B", description: "", traits: [] },
      ],
    } as unknown as Species);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Give the species a walking speed, or one on every subrace.");
    expect((wrapper.vm as unknown as { canSave: boolean }).canSave).toBe(false);
  });

  it("allows a species with no walk of its own when every subrace walks", async () => {
    const wrapper = mountDetail({
      id: "s1",
      campaign_id: null,
      name: "Heritage",
      speed: null,
      subraces: [
        { name: "A", description: "", traits: [], speed: { walk: 25 } },
        { name: "B", description: "", traits: [], speed: { walk: 30 } },
      ],
    } as unknown as Species);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).toHaveBeenCalled();
  });

  describe("what is saved", () => {
    type Vm = { save: () => Promise<void>; form: Record<string, unknown> };
    const base = { id: "s1", campaign_id: null, name: "Owlfolk", speed: { walk: 30 } } as unknown as Species;
    const saved = async (species: Species, edit: (form: Vm["form"]) => void = () => undefined) => {
      mocks.update.mockClear();
      const wrapper = mountDetail(species);
      const vm = wrapper.vm as unknown as Vm;
      edit(vm.form);
      await vm.save();
      return mocks.update.mock.calls[0][0].update;
    };

    it("opens imported ability score increases through asiToString", () => {
      const open = (asi: unknown) =>
        (mountDetail({ ...base, ability_score_increases: asi } as unknown as Species).vm as unknown as Vm).form.asiDescription;
      expect(open({ dex: 2, int: 1 })).toBe("+2 DEX, +1 INT");
    });

    it("trims the name and the source, and stores blanks as null", async () => {
      const update = await saved(base, (f) => {
        f.name = "  Owlfolk  ";
        f.source = "   ";
        f.avg_height = " ";
        f.avg_weight = "";
        f.image_url = "";
        f.size = "";
      });
      expect(update).toMatchObject({ name: "Owlfolk", source: null, avg_height: null, avg_weight: null, image_url: null, size: null });
    });

    it("keeps an ability score text it cannot read as a description, and drops a blank one", async () => {
      expect((await saved(base, (f) => { f.asiDescription = "   "; })).ability_score_increases).toBeNull();
      expect((await saved(base, (f) => { f.asiDescription = "A knack for owls"; })).ability_score_increases).toEqual({ description: "A knack for owls" });
    });

    it("leaves the AI mark alone when only tags change, and marks the entry edited when its content does", async () => {
      const ai = { ...base, ai_provenance: { model: "gpt", edited: false }, tags: [], traits: null, languages: [], subraces: null, granted_spells: [], description: null, size: null, ability_score_increases: null } as unknown as Species;
      expect((await saved(ai, (f) => { f.tags = ["owls"]; })).ai_provenance).toEqual({ model: "gpt", edited: false });
      expect((await saved(ai, (f) => { f.name = "Owlkin"; })).ai_provenance).toEqual({ model: "gpt", edited: true });
      expect((await saved(ai, (f) => { f.languages = ["Elvish"]; })).ai_provenance).toEqual({ model: "gpt", edited: true });
    });
  });
});
