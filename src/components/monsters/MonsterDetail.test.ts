import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sourceLabel } from "@/lib/library/sourceLabel";
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
 *
 * Since #895, "Copy to campaign…" is no longer its own header button — it is
 * one row of the shared EntitySendMenu (see EntitySendMenu.test.ts for that
 * component's own coverage), which is real here, not stubbed. Its panel is
 * teleported to `document.body` and only exists while open, so reaching the
 * row means mounting `attachTo: document.body`, clicking the "Send to…"
 * trigger, and querying the teleported panel directly — the same pattern
 * EntitySendMenu.test.ts establishes.
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
    cutout_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_shared: false,
    ...overrides,
  } as Monster;
}

// FocalImage mounts the AI chip, whose module reads `useStorage`: keep the real exports.
vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, new Map()),
  }),
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@vueuse/core", async (importOriginal) => {
  const { ref: vueRef } = await import("vue");
  return {
    ...(await importOriginal<typeof import("@vueuse/core")>()),
    useMediaQuery: (query: string) => vueRef(viewport.mobile && query.includes("width < 48rem")),
  };
});

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock("@/composables/notes/useDmNote", () => ({ fetchDmNoteColumn: async () => "the stored note" }));

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

// A DM, not the admin: shared-art edits stay personal overrides and upload to the user's folder.
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAppAdmin: false }),
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

function findButton(wrapper: ReturnType<typeof mountDetail>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

// The EntitySendMenu panel, teleported to <body> and only present while open —
// same helper EntitySendMenu.test.ts uses.
function sendMenuPanel() {
  return document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Send to…"]');
}

async function openSendMenu(wrapper: ReturnType<typeof mountDetail>) {
  await findButton(wrapper, "Send to…")!.trigger("click");
}

function copyRow() {
  // Row 0 is Scriptorium, row 1 is Copy to campaign — EntitySendMenu's fixed order.
  return sendMenuPanel()!.querySelectorAll("button")[1];
}

function mountDetail(monsterProp: Monster | null) {
  return mount(MonsterDetail, {
    props: { monster: monsterProp },
    attachTo: document.body,
    global: {
      stubs: {
        DmNoteBox: true,
        MonsterEditMobile: true,
        MonsterGenerateDialog: true,
        EntityImageBlock: true,
        StatBlockEditor: true,
        CampaignScopeField: true,
        EntityCombobox: true,
        RichTextEditor: true,
        TagInput: true,
        PaywallModal: true,
        EntityBacklinks: true,
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

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("offers Copy to campaign… (via the Send to… menu) for an owned monster", async () => {
    const wrapper = mountDetail(monster());
    expect(findButton(wrapper, "Send to…")).toBeTruthy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("monsters");
    expect(dialog.props("ids")).toEqual(["monster-1"]);
    expect(dialog.props("label")).toBe("monster");

    await openSendMenu(wrapper);
    expect(sendMenuPanel()).not.toBeNull();
    expect(copyRow().textContent).toContain("Copy to campaign…");
  });

  it("clicking the Copy to campaign… row opens the dialog", async () => {
    const wrapper = mountDetail(monster());
    await openSendMenu(wrapper);
    copyRow().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer the Send to… menu for a shared/library monster", () => {
    const wrapper = mountDetail(monster({ is_shared: true }));
    expect(findButton(wrapper, "Send to…")).toBeUndefined();
  });

  it("does not offer the Send to… menu for a brand-new (unsaved) monster", () => {
    const wrapper = mountDetail(null);
    expect(findButton(wrapper, "Send to…")).toBeUndefined();
  });

  it("a copied event toasts the monster name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = mountDetail(monster({ name: "Owlbear" }));
    await openSendMenu(wrapper);
    copyRow().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

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
    await openSendMenu(wrapper);
    copyRow().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // Two PaywallModals live here now (monsters, send-to-Scriptorium) — the
    // copy-to-campaign quota reopens the monsters one specifically, same ref
    // this file already mounts for its own create flow.
    const paywalls = wrapper.findAllComponents({ name: "PaywallModal" });
    expect(paywalls).toHaveLength(2);
    expect(paywalls.find((p) => p.props("resource") === "monsters")?.props("modelValue")).toBe(true);
  });
});

describe("MonsterDetail — saves only what changed (#946)", () => {
  beforeEach(() => {
    updateMonster.mockReset();
    routerPush.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function saveFrom(wrapper: ReturnType<typeof mountDetail>) {
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("save");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("sends only the edited column, not the untouched ones", async () => {
    const wrapper = mountDetail(monster({ habitat: "Forest" }));
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("update:title", "Dire Owlbear");
    await saveFrom(wrapper);
    expect(updateMonster).toHaveBeenCalledWith({ id: "monster-1", update: { name: "Dire Owlbear" } });
  });

  it("never sends the DM note, which DmNoteBox owns", async () => {
    const wrapper = mountDetail(monster({ notes: "secret" }));
    wrapper.findComponent({ name: "EntityEditorActionBar" }).vm.$emit("update:title", "Dire Owlbear");
    await saveFrom(wrapper);
    expect(updateMonster.mock.calls[0][0].update).not.toHaveProperty("notes");
  });

  it("skips the update call when nothing changed, and still leaves the editor", async () => {
    const wrapper = mountDetail(monster());
    await saveFrom(wrapper);
    expect(updateMonster).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/monsters");
  });
});

describe("MonsterDetail — create, delete, duplicate, customize", () => {
  const actionBar = (w: ReturnType<typeof mountDetail>) => w.findComponent({ name: "EntityEditorActionBar" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    for (const m of [createMonster, updateMonster, deleteMonster, cloneLibraryMonster, routerPush, routerReplace, confirmMock]) m.mockReset();
    createMonster.mockResolvedValue({ id: "new-monster" });
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a new monster under the trimmed name with an empty DM note, and lands on it", async () => {
    const w = mountDetail(null);
    actionBar(w).vm.$emit("update:title", "  Ash Wraith  ");
    actionBar(w).vm.$emit("save");
    await settle();
    expect(createMonster).toHaveBeenCalledWith(expect.objectContaining({ name: "Ash Wraith", notes: null, campaign_id: "campaign-1" }));
    expect(routerPush).toHaveBeenCalledWith("/monsters/new-monster");
  });

  it("creates nothing for a nameless monster", async () => {
    const w = mountDetail(null);
    actionBar(w).vm.$emit("update:title", "   ");
    actionBar(w).vm.$emit("save");
    await settle();
    expect(createMonster).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("opens the paywall, not an error, when the plan's monster limit refuses the create", async () => {
    createMonster.mockRejectedValue({ message: "quota_exceeded" });
    const w = mountDetail(null);
    actionBar(w).vm.$emit("update:title", "Ash Wraith");
    actionBar(w).vm.$emit("save");
    await settle();
    expect(w.findAllComponents({ name: "PaywallModal" }).find((p) => p.props("resource") === "monsters")?.props("modelValue")).toBe(true);
    expect(actionBar(w).props("error")).toBe("");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("shows why a save failed and stays on the page", async () => {
    createMonster.mockRejectedValue(new Error("db is down"));
    const w = mountDetail(null);
    actionBar(w).vm.$emit("update:title", "Ash Wraith");
    actionBar(w).vm.$emit("save");
    await settle();
    expect(actionBar(w).props("error")).toBe("db is down");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("deletes only after the DM confirms, then goes to the list", async () => {
    confirmMock.mockResolvedValueOnce(false);
    const w = mountDetail(monster());
    actionBar(w).vm.$emit("delete");
    await settle();
    expect(deleteMonster).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();

    confirmMock.mockResolvedValueOnce(true);
    actionBar(w).vm.$emit("delete");
    await settle();
    expect(confirmMock.mock.calls[1]![0]).toContain("Owlbear");
    expect(deleteMonster).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/monsters");
  });

  it("duplicates under '(copy)' with the stored note, and goes to the copy", async () => {
    const w = mountDetail(monster({ name: "Owlbear" }));
    await w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Duplicate")!.trigger("click");
    await settle();
    expect(createMonster).toHaveBeenCalledWith(expect.objectContaining({ name: "Owlbear (copy)", notes: "the stored note" }));
    expect(routerPush).toHaveBeenCalledWith("/monsters/new-monster");
  });

  it("customizes a library monster into the DM's own copy and replaces the page with it", async () => {
    cloneLibraryMonster.mockResolvedValue({ id: "my-copy" });
    const w = mountDetail(monster({ is_shared: true }));
    w.findComponent({ name: "LibraryReadOnlyBanner" }).vm.$emit("action");
    await settle();
    expect(cloneLibraryMonster).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/monsters/my-copy");
  });

  describe("on a phone", () => {
    beforeEach(() => {
      viewport.mobile = true;
    });
    afterEach(() => {
      viewport.mobile = false;
    });

    it("leaves the editor for the list when a new monster is cancelled, and for the read view when an existing one is", () => {
      const fresh = mountDetail(null);
      fresh.findComponent({ name: "MonsterEditMobile" }).vm.$emit("cancel");
      expect(routerPush).toHaveBeenCalledWith("/monsters");
      expect(routerReplace).not.toHaveBeenCalled();
      const existing = mountDetail(monster());
      existing.findComponent({ name: "MonsterEditMobile" }).vm.$emit("cancel");
      expect(routerReplace).toHaveBeenCalledWith("/monsters/monster-1");
    });
  });
});

describe("MonsterDetail — AI provenance only follows real content edits (#606)", () => {
  const actionBar = (w: ReturnType<typeof mountDetail>) => w.findComponent({ name: "EntityEditorActionBar" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Given a description, so the only difference between the saves is what the DM changed;
  // the no-description case has its own test below.
  const aiMonster = () => monster({ description: "A hooting horror.", ai_provenance: { generatorType: "monster", provider: "openai", model: "m", generatedAt: "t", edited: false } } as Partial<Monster>);

  beforeEach(() => {
    updateMonster.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("marks an AI monster edited when its name changes", async () => {
    const w = mountDetail(aiMonster());
    actionBar(w).vm.$emit("update:title", "Dire Owlbear");
    actionBar(w).vm.$emit("save");
    await settle();
    expect(updateMonster.mock.calls[0]![0].update.ai_provenance).toMatchObject({ edited: true });
  });

  it("leaves it as generated when only the tags changed", async () => {
    const w = mountDetail(aiMonster());
    w.findComponent({ name: "TagInput" }).vm.$emit("update:modelValue", ["swamp"]);
    actionBar(w).vm.$emit("save");
    await settle();
    expect(updateMonster.mock.calls[0]![0].update).toEqual({ tags: ["swamp"] });
  });

  it("leaves it as generated when only the tags changed on a monster with no description", async () => {
    const w = mountDetail(monster({ description: null, ai_provenance: { generatorType: "monster", provider: "openai", model: "m", generatedAt: "t", edited: false } } as Partial<Monster>));
    w.findComponent({ name: "TagInput" }).vm.$emit("update:modelValue", ["swamp"]);
    actionBar(w).vm.$emit("save");
    await settle();
    expect(updateMonster.mock.calls[0]![0].update).toEqual({ tags: ["swamp"] });
  });
});
