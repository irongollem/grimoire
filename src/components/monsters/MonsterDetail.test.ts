import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, defineComponent, h } from "vue";
import MonsterDetail from "./MonsterDetail.vue";
import type { Monster } from "@/types/monster.types";

/**
 * Covers the Copy to campaign wiring (#598, wave 2) only. MonsterDetail's own
 * save/duplicate/customize/scriptorium behaviour is out of scope here — every
 * other composable it touches is stubbed to the minimum that lets the
 * component mount. CopyToCampaignDialog is replaced with a minimal stand-in
 * that records the props it was given and lets a test fire `copied` /
 * `quota-exceeded` on demand — the dialog's own picker/plan/confirm behaviour
 * is CopyToCampaignDialog.test.ts's job, not this component's.
 */

function monster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "monster-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    name: "Owlbear",
    monster_type: "monstrosity",
    size: "large",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {
      armor_class: 13,
      hit_points: "7d10+21",
      speed: "40 ft.",
      str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
      challenge_rating: "3",
    },
    notes: null,
    image_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_shared: false,
    ...overrides,
  } as Monster;
}

vi.mock("@vueuse/core", () => ({ useMediaQuery: () => false }));

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: false, activeCampaignId: ref("campaign-1") }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: ref([]), getDescendantIds: vi.fn() }),
}));

const createMonster = vi.fn();
const updateMonster = vi.fn();
const deleteMonster = vi.fn();
const cloneLibraryMonster = vi.fn();
vi.mock("@/composables/monsters/useMonsters", () => ({
  useCreateMonster: () => ({ mutateAsync: createMonster }),
  useUpdateMonster: () => ({ mutateAsync: updateMonster }),
  useDeleteMonster: () => ({ mutateAsync: deleteMonster }),
  useCloneLibraryMonster: () => ({ mutateAsync: cloneLibraryMonster }),
}));

vi.mock("@/composables/library/useLibraryMonsterArt", () => ({
  useUpsertLibraryMonsterArt: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
}));

const toastSuccess = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: toastSuccess,
    error: vi.fn(),
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));

vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "label"],
    emits: ["close", "copied", "quota-exceeded"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

function findButton(wrapper: ReturnType<typeof mountDetail>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

function mountDetail(monsterProp: Monster | null) {
  return mount(MonsterDetail, {
    props: { monster: monsterProp },
    global: {
      stubs: {
        MonsterEditMobile: true,
        MonsterGenerateDialog: true,
        EntityImageBlock: true,
        StatBlockEditor: true,
        CampaignScopeField: true,
        EntityCombobox: true,
        RichTextEditor: true,
        TagInput: true,
        PaywallModal: true,
      },
    },
  });
}

describe("MonsterDetail — copy to campaign (#598)", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
    toastSuccess.mockClear();
  });

  it("offers Copy to campaign… for an owned monster", () => {
    const wrapper = mountDetail(monster());
    const button = findButton(wrapper, "Copy to campaign…");
    expect(button).toBeTruthy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("monsters");
    expect(dialog.props("ids")).toEqual(["monster-1"]);
    expect(dialog.props("label")).toBe("monster");
  });

  it("clicking the action opens the dialog", async () => {
    const wrapper = mountDetail(monster());
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer Copy to campaign… for a shared/library monster", () => {
    const wrapper = mountDetail(monster({ is_shared: true }));
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
  });

  it("does not offer Copy to campaign… for a brand-new (unsaved) monster", () => {
    const wrapper = mountDetail(null);
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
  });

  it("a copied event toasts the monster name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = mountDetail(monster({ name: "Owlbear" }));
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(toastSuccess).toHaveBeenCalledWith('Copied "Owlbear" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // create-style navigation follows it, unlike Duplicate/Customize above.
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("a quota-exceeded event closes the dialog and opens the paywall, reusing the existing modal", async () => {
    const wrapper = mountDetail(monster());
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(wrapper.findAllComponents({ name: "PaywallModal" })).toHaveLength(1);
  });
});
