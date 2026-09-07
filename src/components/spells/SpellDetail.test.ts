import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import SpellDetail from "./SpellDetail.vue";
import type { Spell } from "@/types/spell.types";

/**
 * #596: a brand-new spell used to default to `campaign_id: null` ("every
 * campaign") regardless of which campaign the DM was looking at — the
 * hand-rolled "Campaign-only" checkbox this component used to have only ever
 * *added* a scope, it never started with one. These tests cover the flipped
 * default (new spells land in the active campaign; no active campaign is a
 * genuine global case) and guard the trap that default fix nearly introduced:
 * an existing global spell's campaign_id is null too, and a naive
 * `props.spell?.campaign_id ?? activeCampaignId.value` can't tell "no spell
 * yet" apart from "spell has no campaign" — it would silently re-scope every
 * global spell into the active campaign the next time a DM opened and saved it.
 */

const activeCampaignId = ref<string | null>("campaign-1");

// reactive(), not a plain object with a getter: SpellDetail reads this store
// through Pinia's storeToRefs, which only picks up properties that are
// themselves refs/reactive — a plain getter is invisible to it.
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({ activeCampaignId, isAiEnabled: false }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/library/useLibrarySpellArt", () => ({
  useUpsertLibrarySpellArt: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: "new-spell" }),
  update: vi.fn().mockResolvedValue({ id: "existing-spell" }),
}));
vi.mock("@/composables/spells/useSpells", () => ({
  useCreateSpell: () => ({ mutateAsync: mocks.create }),
  useUpdateSpell: () => ({ mutateAsync: mocks.update }),
  useDeleteSpell: () => ({ mutateAsync: vi.fn() }),
}));

const stubs = {
  SpellGenerateDialog: true,
  SpellLevelAdvisorModal: true,
  SpellLevelAdvisorPanel: true,
  SpellComponentsSection: true,
  SpellMechanicsSection: true,
  SpellClassesSection: true,
  SpellTimingSection: true,
  SpellDetailHeader: true,
  CampaignScopeField: true,
  EntityImageBlock: true,
  RichTextEditor: true,
  TagInput: true,
  AppInput: true,
  AppSelect: true,
};

function mountDetail(spell: Spell | null = null) {
  return shallowMount(SpellDetail, { props: { spell }, global: { stubs } });
}

describe("SpellDetail scope default", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.create.mockClear();
    mocks.update.mockClear();
  });

  it("creates a new spell against the active campaign", async () => {
    const wrapper = mountDetail(null);
    (wrapper.vm as unknown as { name: string }).name = "Fireball";
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: "campaign-1" }),
    );
  });

  it("creates a global spell when there is no active campaign", async () => {
    activeCampaignId.value = null;
    const wrapper = mountDetail(null);
    (wrapper.vm as unknown as { name: string }).name = "Fireball";
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: null }),
    );
  });

  it("leaves an existing global spell's scope alone even with a campaign active", async () => {
    const existing = { id: "sp1", campaign_id: null, name: "Owl's Insight", classes: [], components: [], tags: [] } as unknown as Spell;
    const wrapper = mountDetail(existing);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ campaign_id: null }) }),
    );
  });
});
