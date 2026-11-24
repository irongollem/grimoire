import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, defineComponent, h } from "vue";
import NpcDetail from "./NpcDetail.vue";
import type { Npc } from "@/types/npc.types";
import { emptyDefenses } from "@/types/statBlock.types";
import { createPinia, setActivePinia } from "pinia";
import { useAskFormFillStore } from "@/stores/ui/askFormFill";
import { useAskUiStore } from "@/stores/ui/ask";
import type { NpcAiGenerated } from "@/ai/types";

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
    voice: null,
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
// FocalImage mounts the AI chip, whose module reads `useStorage`: keep the real exports.
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useMediaQuery: () => mobileMode,
}));

let statBlocksOffered = true;
vi.mock("@/composables/rules/useGameSystem", () => ({
  useGameSystem: () => ({ offers: () => statBlocksOffered }),
}));

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: false, activeCampaignId: ref("campaign-1") }),
}));

// Read directly on each call, so a test can switch the DM into Play mode.
let appDmMode: "prep" | "play" = "prep";
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({
    get dmMode() {
      return appDmMode;
    },
  }),
}));

const confirmMock = vi.fn();
vi.mock("@/composables/useConfirm", () => ({
  useConfirm: () => ({ confirm: confirmMock, notify: vi.fn() }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: ref([]), getDescendantIds: vi.fn() }),
}));

vi.mock("@/composables/monsters/useMonsters", () => ({
  useCreateMonster: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: () => ({ data: ref([]) }),
}));

vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: ref(new Map()) }),
}));

vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useCreateScriptoriumBook: () => ({ mutateAsync: vi.fn() }),
}));

const sendNarrativeEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendNarrativeEvent }),
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

vi.mock("@/components/common/overlays/CopyToCampaignDialog.vue", () => ({
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
        DmNoteBox: true,
        PlayerNotesWidget: true,
        FamilyBlock: true,
        NpcEditMobile: true,
        NpcSidebar: true,
        NpcIdentitySection: true,
        ConnectionsSection: true,
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

// The Generate button and the form it fills meet in the Ask store (#1270).
beforeEach(() => setActivePinia(createPinia()));

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
    // Three PaywallModals live here now (npcs, send-to-Scriptorium,
    // promote-to-monster) — the copy-to-campaign quota reopens the npcs one
    // specifically, same ref this file already mounts for its own create flow.
    const paywalls = wrapper.findAllComponents({ name: "PaywallModal" });
    expect(paywalls).toHaveLength(3);
    expect(paywalls.find((p) => p.props("resource") === "npcs")?.props("modelValue")).toBe(true);
  });

  it("the mobile overflow sheet's copy-to-campaign emit opens the same dialog", async () => {
    mobileMode = true;
    const wrapper = mount(NpcDetail, {
      props: { npc: npc() },
      global: {
        stubs: {
          FamilyBlock: true,
          NpcEditMobile: {
            template: '<button class="mobile-copy" @click="$emit(\'copy-to-campaign\')" />',
          },
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

describe("NpcDetail — save sends only what changed (#946)", () => {
  beforeEach(() => { updateNpc.mockReset(); updateNpc.mockResolvedValue({}); });

  it("does not write back a field the server changed while the DM edited another", async () => {
    const base = npc({ name: "Elowen Vance", occupation: "Innkeeper" });
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as { form: { name: string }; save: () => Promise<void> };
    vm.form.name = "Elowen Vance-Hale";
    await wrapper.setProps({ npc: { ...base, occupation: "Mayor" } });
    await vm.save();
    expect(updateNpc).toHaveBeenCalledTimes(1);
    const sent = updateNpc.mock.calls[0][0].update;
    expect(sent.name).toBe("Elowen Vance-Hale");
    expect(sent).not.toHaveProperty("occupation");
    expect(sent).not.toHaveProperty("campaign_id");
  });

  it("keeps the stat block's tactics through an edit and into the saved stat block", async () => {
    const tactics = { role: "leader" as const, note: "Never leaves the door" };
    const base = npc({
      stat_block: {
        armor_class: 12, hit_points: "2d8", speed: "30 ft.",
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
        challenge_rating: "1", defenses: emptyDefenses(), tactics,
      },
    });
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as { form: { statBlock: { int: number; tactics?: unknown } }; save: () => Promise<void> };
    expect(vm.form.statBlock.tactics).toEqual(tactics);
    vm.form.statBlock.int = 14;
    await vm.save();
    expect(updateNpc.mock.calls[0][0].update.stat_block.tactics).toEqual(tactics);
  });

  // Bug caught: Voice left out of the save payload or the draft, so a typed voice vanished on save.
  it("saves a typed Voice, and saves null when it is emptied again", async () => {
    const base = npc({ voice: null });
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as { form: { voice: string | null }; save: () => Promise<void> };
    vm.form.voice = "Slow, as if tasting each word. 'Sit. The tea is hot.'";
    await vm.save();
    expect(updateNpc.mock.calls[0][0].update.voice).toBe("Slow, as if tasting each word. 'Sit. The tea is hot.'");

    updateNpc.mockClear();
    const had = mountDetail(npc({ voice: "Clipped." }));
    const vm2 = had.vm as unknown as { form: { voice: string | null }; save: () => Promise<void> };
    vm2.form.voice = "";
    await vm2.save();
    expect(updateNpc.mock.calls[0][0].update.voice).toBeNull();
  });

  // Bug caught: Voice left out of the save payload or the draft, so a typed voice vanished on save.
  it("saves a typed Voice, and saves null when it is emptied again", async () => {
    const base = npc({ voice: null });
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as { form: { voice: string | null }; save: () => Promise<void> };
    vm.form.voice = "Slow, as if tasting each word. 'Sit. The tea is hot.'";
    await vm.save();
    expect(updateNpc.mock.calls[0][0].update.voice).toBe("Slow, as if tasting each word. 'Sit. The tea is hot.'");

    updateNpc.mockClear();
    const had = mountDetail(npc({ voice: "Clipped." }));
    const vm2 = had.vm as unknown as { form: { voice: string | null }; save: () => Promise<void> };
    vm2.form.voice = "";
    await vm2.save();
    expect(updateNpc.mock.calls[0][0].update.voice).toBeNull();
  });

  it("never sends the DM note, which DmNoteBox owns", async () => {
    const base = npc({ name: "Elowen Vance", notes: "secret" });
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as { form: { name: string }; save: () => Promise<void> };
    vm.form.name = "Elowen Vance-Hale";
    await vm.save();
    expect(updateNpc.mock.calls[0][0].update).not.toHaveProperty("notes");
  });
});

describe("NpcDetail — telling the players about a newly shown NPC", () => {
  type Vm = { form: { name: string; player_visible_to: string[]; player_visible_fields: string[] }; save: () => Promise<void> };
  beforeEach(() => {
    updateNpc.mockReset().mockResolvedValue({});
    sendNarrativeEvent.mockClear();
    routerPush.mockClear();
    appDmMode = "play";
  });

  async function reveal(base: Npc, tweak: (form: Vm["form"]) => void = () => undefined) {
    const wrapper = mountDetail(base);
    const vm = wrapper.vm as unknown as Vm;
    vm.form.player_visible_to = ["pm-1"];
    tweak(vm.form);
    await vm.save();
  }

  it("announces a disguised NPC under its cover and never the true name", async () => {
    await reveal(
      npc({ name: "Lord Vexan", disguise_name: "The Stranger", is_revealed: false, player_visible_fields: ["name"] }),
    );
    expect(sendNarrativeEvent).toHaveBeenCalledTimes(1);
    const text = sendNarrativeEvent.mock.calls[0][0] as string;
    expect(text).toBe("You encounter The Stranger.");
    expect(text).not.toContain("Vexan");
  });

  it("announces under no name when the DM did not share the name field", async () => {
    await reveal(npc({ name: "Lord Vexan", player_visible_fields: [] }));
    const text = sendNarrativeEvent.mock.calls[0][0] as string;
    expect(text).toBe("You encounter someone.");
    expect(text).not.toContain("Vexan");
  });

  it("announces under no name when the shared name is only blank space", async () => {
    await reveal(npc({ player_visible_fields: ["name"] }), (form) => {
      form.name = "   ";
    });
    expect(sendNarrativeEvent.mock.calls[0][0]).toBe("You encounter someone.");
  });

  it("announces nothing in Prep mode", async () => {
    appDmMode = "prep";
    await reveal(npc({ player_visible_fields: ["name"] }));
    expect(sendNarrativeEvent).not.toHaveBeenCalled();
  });

  it("announces nothing when the NPC was already visible to a player, only a later player is added", async () => {
    await reveal(npc({ player_visible_to: ["pm-0"], player_visible_fields: ["name"] }));
    expect(sendNarrativeEvent).not.toHaveBeenCalled();
  });

  it("saving with nothing changed writes nothing but still goes back to the list", async () => {
    const wrapper = mountDetail(npc());
    await (wrapper.vm as unknown as Vm).save();
    expect(updateNpc).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/npcs");
  });

  it("creating an NPC stays on its own page rather than the list", async () => {
    createNpc.mockReset().mockResolvedValue({ id: "new-1" });
    const wrapper = mountDetail(null);
    const vm = wrapper.vm as unknown as Vm;
    vm.form.name = "Brand New";
    await vm.save();
    expect(createNpc).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/npcs/new-1");
  });

  it("saving an existing NPC goes back to the bare list", async () => {
    await reveal(npc());
    expect(routerPush).toHaveBeenCalledWith("/npcs");
  });
});

describe("NpcDetail — delete", () => {
  beforeEach(() => {
    deleteNpc.mockReset().mockResolvedValue(undefined);
    confirmMock.mockReset();
    routerPush.mockClear();
  });

  it("keeps the NPC when the confirm is cancelled, and deletes then returns to the list when confirmed", async () => {
    const wrapper = mountDetail(npc());
    const vm = wrapper.vm as unknown as { confirmDelete: () => Promise<void> };
    confirmMock.mockResolvedValue(false);
    await vm.confirmDelete();
    expect(deleteNpc).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
    confirmMock.mockResolvedValue(true);
    await vm.confirmDelete();
    expect(deleteNpc).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/npcs");
  });
});

describe("NpcDetail — stat blocks follow the game system (#934)", () => {
  beforeEach(() => {
    statBlocksOffered = true;
  });

  const tabIds = (wrapper: ReturnType<typeof mountDetail>) =>
    (wrapper.findComponent({ name: "TabBar" }).props("tabs") as { id: string }[]).map((t) => t.id);

  // Bug caught: a Generic campaign's NPC form still offering the Combat tab,
  // whose only content is the 5e stat block and the bestiary link.
  it("offers the Combat tab only where the system has stat blocks", () => {
    expect(tabIds(mountDetail(npc()))).toContain("combat");
    statBlocksOffered = false;
    const ids = tabIds(mountDetail(npc()));
    expect(ids).not.toContain("combat");
    expect(ids).toEqual(["lore", "inventory"]);
  });
});

describe("NpcDetail — the Familiar's Generate card fills this form (#1270)", () => {
  const generated: NpcAiGenerated = {
    name: "Mira Vale", race: "Dwarf", alignment: "lawful neutral", age: "", occupation: "Smith",
    appearance: "", personality: "", voice: "", backstory: "", notes: "", status: "alive", relationship: "friendly",
    tags: ["guild"], true_portrait_prompt: "", portrait_url: null,
  };

  // Bug caught: the card's result was dropped on the floor because nothing was listening for it on the open sheet.
  it("takes the generated person into the open sheet, saving nothing", () => {
    const wrapper = mountDetail(null);
    const filler = useAskFormFillStore().fillerFor<NpcAiGenerated, undefined>("npc_sheet");
    expect(filler).not.toBeNull();
    filler?.apply(generated);
    const vm = wrapper.vm as unknown as { form: { name: string; occupation: string | null } };
    expect(vm.form).toMatchObject({ name: "Mira Vale", occupation: "Smith" });
    expect(createNpc).not.toHaveBeenCalled();
  });

  // Bug caught: a closed editor stayed offered to the card, which would then write into nothing.
  it("stops offering the sheet once the editor is gone", () => {
    const wrapper = mountDetail(null);
    wrapper.unmount();
    expect(useAskFormFillStore().fillerFor("npc_sheet")).toBeNull();
  });

  // Bug caught: the header's Generate opened nothing now that the dialog is gone.
  it("opens the NPC card in the Familiar from the mobile Generate", async () => {
    mobileMode = true;
    const wrapper = mount(NpcDetail, {
      props: { npc: null },
      global: { stubs: { NpcEditMobile: { template: '<button class="gen" @click="$emit(\'generate\')" />' }, FamilyBlock: true, PaywallModal: true } },
    });
    await wrapper.find(".gen").trigger("click");
    expect(useAskUiStore().pendingGenerator?.generatorId).toBe("npc_sheet");
  });
});
