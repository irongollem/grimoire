import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, defineComponent, h } from "vue";
import NpcDetail from "./NpcDetail.vue";
import type { Npc } from "@/types/npc.types";

/**
 * Covers the Copy to campaign wiring (#885) only. NpcDetail's own save/
 * delete/scriptorium behaviour is out of scope here — every other composable
 * it touches is stubbed to the minimum that lets the component mount.
 * CopyToCampaignDialog is replaced with a minimal stand-in that records the
 * props it was given and lets a test fire `copied` / `quota-exceeded` on
 * demand — the dialog's own picker/plan/confirm behaviour is
 * CopyToCampaignDialog.test.ts's job, not this component's.
 *
 * Unlike MonsterDetail, the desktop "Copy to campaign…" *button* does not
 * live in this component's own template — it lives in NpcDetailView.vue's
 * PageHeader, which calls the exposed `openCopy()` (mirroring how it already
 * calls the exposed `sendToScriptorium()`). So this file drives `openCopy`
 * directly, the same way NpcDetailView would via the template ref, and
 * separately exercises the mobile twin: NpcEditMobile emits
 * `copy-to-campaign`, which this component's template wires to `openCopy`.
 */

function npc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    name: "Elowen Vance",
    race: "Half-Elf",
    alignment: "neutral good",
    age: "34",
    occupation: "Innkeeper",
    location_id: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: null,
    status: "alive",
    relationship: "friendly",
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: [],
    stat_block: null,
    linked_monster_id: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Npc;
}

// A mutable flag behind the factory, reset per test — lets the same file
// cover both the desktop `<form>` branch and the mobile `NpcEditMobile`
// branch without `vi.resetModules()`/dynamic re-imports. The component only
// ever reads the return value directly (never `.value`), so a bare boolean
// unwraps correctly regardless of the real `useMediaQuery`'s `ComputedRef`
// return type.
let mobileMode = false;
vi.mock("@vueuse/core", () => ({ useMediaQuery: () => mobileMode }));

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: false, decryptedApiKey: null, activeCampaignId: ref("campaign-1") }),
}));

vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ dmMode: "prep" }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: ref([]), getDescendantIds: vi.fn() }),
}));

vi.mock("@/composables/monsters/useMonsters", () => ({
  useAllMonsters: () => ({ data: ref([]) }),
  useCreateMonster: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendNarrativeEvent: vi.fn() }),
}));

const createNpc = vi.fn();
const updateNpc = vi.fn();
const deleteNpc = vi.fn();
vi.mock("@/composables/npcs/useNpcs", () => ({
  useCreateNpc: () => ({ mutateAsync: createNpc, isPending: ref(false) }),
  useUpdateNpc: () => ({ mutateAsync: updateNpc, isPending: ref(false) }),
  useDeleteNpc: () => ({ mutateAsync: deleteNpc }),
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

interface NpcDetailExposed {
  openCopy: () => void;
}

function mountDetail(npcProp: Npc | null, { mobile = false }: { mobile?: boolean } = {}) {
  mobileMode = mobile;
  return mount(NpcDetail, {
    props: { npc: npcProp },
    global: {
      stubs: {
        NpcEditMobile: true,
        NpcGenerateDialog: true,
        NpcSidebar: true,
        NpcIdentitySection: true,
        NpcRelationsSection: true,
        NpcLoreTab: true,
        NpcInventorySection: true,
        TabBar: true,
        EntityCombobox: true,
        StatBlockEditor: true,
        PaywallModal: true,
      },
    },
  });
}

describe("NpcDetail — copy to campaign (#885)", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
    toastSuccess.mockClear();
    mobileMode = false;
  });

  it("mounts the dialog with the npc's own id, closed by default", () => {
    const wrapper = mountDetail(npc());
    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("npcs");
    expect(dialog.props("ids")).toEqual(["npc-1"]);
    expect(dialog.props("label")).toBe("NPC");
  });

  it("exposes openCopy, which the desktop PageHeader (NpcDetailView.vue) calls directly", async () => {
    const wrapper = mountDetail(npc());
    await (wrapper.vm as unknown as NpcDetailExposed).openCopy();

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not mount the dialog at all for a brand-new (unsaved) NPC", () => {
    const wrapper = mountDetail(null);
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).exists()).toBe(false);
  });

  it("a copied event toasts the NPC name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = mountDetail(npc({ name: "Elowen Vance" }));
    await (wrapper.vm as unknown as NpcDetailExposed).openCopy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(toastSuccess).toHaveBeenCalledWith('Copied "Elowen Vance" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // create-style navigation follows it.
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("a quota-exceeded event closes the dialog and opens the paywall, reusing the existing modal", async () => {
    const wrapper = mountDetail(npc());
    await (wrapper.vm as unknown as NpcDetailExposed).openCopy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(wrapper.findAllComponents({ name: "PaywallModal" })).toHaveLength(1);
  });

  it("the mobile overflow sheet's copy-to-campaign emit opens the same dialog", async () => {
    mobileMode = true;
    const wrapper = mount(NpcDetail, {
      props: { npc: npc() },
      global: {
        stubs: {
          NpcEditMobile: {
            template: '<button class="mobile-copy" @click="$emit(\'copy-to-campaign\')" />',
          },
          NpcGenerateDialog: true,
          PaywallModal: true,
        },
      },
    });

    // `NpcEditMobile`'s stub stands in for the real overflow-sheet item —
    // `NpcDetail.vue` wires `@copy-to-campaign="openCopy"` on it, mirroring
    // `@delete="confirmDelete"` right beside it.
    await wrapper.find(".mobile-copy").trigger("click");
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });
});
