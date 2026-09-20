import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import SpellDetail from "./SpellDetail.vue";
import SpellDetailHeader from "./SpellDetailHeader.vue";
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
const mockRouterPush = vi.hoisted(() => vi.fn());
const mockRouterReplace = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  // SpellDetail itself never renders a RouterLink (shallowMount stubs
  // SpellDetailHeader out entirely), but the "SpellDetailHeader send
  // actions" suite below mounts the real header, which does.
  RouterLink: { name: "RouterLink", template: "<a><slot /></a>" },
}));
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
  toastSuccess: vi.fn(),
}));
vi.mock("@/composables/spells/useSpells", () => ({
  useCreateSpell: () => ({ mutateAsync: mocks.create }),
  useUpdateSpell: () => ({ mutateAsync: mocks.update }),
  useDeleteSpell: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: vi.fn(),
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
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
  CopyToCampaignDialog: true,
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

/**
 * #598: a spell's own Copy to campaign runs through SpellDetailHeader (its
 * actions do not live in a PageHeader, unlike every sibling entity — see the
 * story spec) and, unlike save/delete, must not navigate on success: the copy
 * lands in another campaign that neither this page nor the Spellbook list can
 * show, so the toast naming the destination is the only confirmation there is.
 */
describe("SpellDetail copy to campaign", () => {
  const existing = {
    id: "sp1",
    campaign_id: "campaign-1",
    name: "Fireball",
    classes: [],
    components: [],
    tags: [],
  } as unknown as Spell;

  beforeEach(() => {
    mocks.toastSuccess.mockClear();
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
  });

  it("opens the dialog for this spell when the header emits copyToCampaign", async () => {
    const wrapper = mountDetail(existing);
    wrapper.findComponent({ name: "SpellDetailHeader" }).vm.$emit("copyToCampaign");
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("ids")).toEqual(["sp1"]);
    expect(dialog.props("table")).toBe("spells");
  });

  it("toasts the destination and closes the dialog on copied, without navigating", async () => {
    const wrapper = mountDetail(existing);
    wrapper.findComponent({ name: "SpellDetailHeader" }).vm.$emit("copyToCampaign");
    await wrapper.vm.$nextTick();

    wrapper.findComponent({ name: "CopyToCampaignDialog" }).vm.$emit("copied", {
      copied: 1,
      targetName: "Icewind Dale",
    });
    await wrapper.vm.$nextTick();

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Copied "Fireball" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

/**
 * #895: SpellDetailHeader folds Send to Scriptorium + Copy to campaign… into
 * one EntitySendMenu trigger — but only for an owned spell. A shared
 * (reference) spell has no campaign to copy into, so it keeps standing on
 * its own bare Send to Scriptorium button rather than opening a menu with a
 * single row in it. Mounted directly (not through SpellDetail, which stubs
 * the header) so these assertions see the real conditional template.
 */
describe("SpellDetailHeader send actions", () => {
  const baseProps = {
    hasSpell: true,
    isAiEnabled: false,
    isSaving: false,
    isDeleting: false,
    isSendingToScriptorium: false,
    canSave: true,
  };

  function mountHeader(isShared: boolean) {
    return mount(SpellDetailHeader, { props: { ...baseProps, isShared } });
  }

  it("owned spell: renders the combined Send to… trigger instead of a bare Send to Scriptorium button", () => {
    const wrapper = mountHeader(false);

    expect(wrapper.find('[aria-haspopup="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Send to…");
    expect(wrapper.text()).not.toContain("Copy to campaign…");
  });

  it("shared spell: keeps the standalone Send to Scriptorium button and renders no Send to… trigger", () => {
    const wrapper = mountHeader(true);

    expect(wrapper.find('[aria-haspopup="dialog"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Send to Scriptorium");
    expect(wrapper.text()).not.toContain("Copy to campaign…");
  });

  it("shared spell: clicking the bare button still emits sendToScriptorium", async () => {
    const wrapper = mountHeader(true);

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("sendToScriptorium")).toHaveLength(1);
    expect(wrapper.emitted("copyToCampaign")).toBeUndefined();
  });
});
