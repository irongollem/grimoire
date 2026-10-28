import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref, defineComponent, h } from "vue";
import ItemDetailView from "./ItemDetailView.vue";

/**
 * Covers the Copy to campaign wiring (#598, wave 2) only — the rest of this
 * view (edit/clone/delete/save) is exercised through ItemDetail.vue's own
 * tests. CopyToCampaignDialog is replaced with a minimal stand-in that
 * records the props it was given and lets a test fire `copied` on demand;
 * the dialog's own picker/plan/confirm behaviour is CopyToCampaignDialog.test.ts's
 * job, not this view's.
 *
 * Since #895, "Copy to campaign…" is no longer its own header button — it is
 * the second row of the edit-mode `EntitySendMenu`. `EntitySendMenu` is left
 * unstubbed so these tests still exercise the real trigger-click-then-panel-
 * row flow, the same pattern EntitySendMenu.test.ts establishes: open the
 * teleported `[role="dialog"][aria-label="Send to…"]` panel and click its
 * second button.
 */
const mocks = vi.hoisted(() => ({
  route: {
    name: "item-detail",
    params: { id: "item-1" },
    query: {} as Record<string, string>,
  },
  replace: vi.fn(),
  item: {
    id: "item-1",
    name: "Longsword of Testing",
    item_type: "weapon",
    rarity: "uncommon",
    campaign_id: "campaign-1",
  } as Record<string, unknown>,
  isShared: false,
  userId: "me",
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  customize: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/composables/items/useItems", () => ({
  useResolvedItem: () => ({
    data: ref({ item: mocks.item, isShared: mocks.isShared }),
    isLoading: ref(false),
  }),
  useCustomizeLibraryItem: () => ({ customizeLibraryItem: mocks.customize }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { id: mocks.userId } }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: mocks.toastError,
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

// `EntitySendMenu`'s panel is teleported to document.body and only exists
// while open (see EntitySendMenu.test.ts) — this view is mounted with
// `attachTo: document.body` so that teleport lands somewhere real, and every
// test cleans the body up afterwards.
function sendMenuPanel() {
  return document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Send to…"]');
}

async function openCopyFromSendMenu(wrapper: Awaited<ReturnType<typeof mountView>>) {
  await wrapper.get('[aria-haspopup="dialog"]').trigger("click");
  const rows = sendMenuPanel()!.querySelectorAll("button");
  rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flushPromises();
}

afterEach(() => {
  document.body.innerHTML = "";
});

// The edit-mode action row is gated on `isEditing && itemDetail` — the
// second half is a template ref to ItemDetail, which Vue settles on the
// post-render flush queue rather than synchronously within mount(), so every
// caller awaits one tick before reading the header actions.
async function mountView() {
  const wrapper = mount(ItemDetailView, {
    attachTo: document.body,
    global: {
      stubs: {
        ItemSheet: true,
        ItemDetail: true,
        ItemSendMenu: true,
        DmNoteBox: true,
        LoadingSpinner: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("ItemDetailView — copy to campaign (#598)", () => {
  beforeEach(() => {
    mocks.route.name = "item-detail";
    mocks.route.params = { id: "item-1" };
    mocks.route.query = { edit: "true" };
    mocks.item = {
      id: "item-1",
      name: "Longsword of Testing",
      item_type: "weapon",
      rarity: "uncommon",
      campaign_id: "campaign-1",
    };
    mocks.isShared = false;
    mocks.replace.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
  });

  it("offers Copy to campaign… (via the Send to… menu) for an owned item in edit mode, wired to the item's own scope", async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[aria-haspopup="dialog"]').exists()).toBe(true);

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("items");
    expect(dialog.props("ids")).toEqual(["item-1"]);
    expect(dialog.props("label")).toBe("item");
  });

  it("mounts the DM note box for an owned item in both modes, and never for a shared one (#983)", async () => {
    let wrapper = await mountView();
    expect(wrapper.findComponent({ name: "DmNoteBox" }).props()).toMatchObject({ type: "item", id: "item-1" });
    wrapper.unmount();

    mocks.route.query = {};
    wrapper = await mountView();
    expect(wrapper.findComponent({ name: "DmNoteBox" }).exists()).toBe(true);
    wrapper.unmount();

    mocks.isShared = true;
    wrapper = await mountView();
    expect(wrapper.findComponent({ name: "DmNoteBox" }).exists()).toBe(false);
  });

  it("clicking the Copy to campaign… row in the Send to… menu opens the dialog", async () => {
    const wrapper = await mountView();
    await openCopyFromSendMenu(wrapper);

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer the Send to… menu for a shared/library item", async () => {
    mocks.isShared = true;
    const wrapper = await mountView();
    expect(wrapper.find('[aria-haspopup="dialog"]').exists()).toBe(false);
  });

  it("a copied event toasts the item name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = await mountView();
    await openCopyFromSendMenu(wrapper);

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Copied "Longsword of Testing" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // create-style navigation follows it, unlike "Clone" on this same row.
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringContaining("/vault/"));
  });
});


describe("ItemDetailView — a co-DM's view of the owner's personal item (#590)", () => {
  beforeEach(() => {
    mocks.route.name = "item-detail";
    mocks.route.params = { id: "item-1" };
    mocks.isShared = false;
    mocks.userId = "me";
  });

  function ownersItem(userId: string) {
    mocks.item = {
      id: "item-1",
      name: "Longsword of Testing",
      item_type: "weapon",
      rarity: "uncommon",
      campaign_id: null,
      user_id: userId,
    };
  }

  function actionLabels(wrapper: Awaited<ReturnType<typeof mountView>>) {
    return wrapper.findAll("button").map((b) => b.text());
  }

  it("offers Edit on the caller's own library item, and no caption", async () => {
    mocks.route.query = {};
    ownersItem("me");
    const wrapper = await mountView();
    expect(actionLabels(wrapper).some((l) => l.includes("Edit"))).toBe(true);
    expect(wrapper.find('[data-testid="read-only-library-note"]').exists()).toBe(false);
  });

  it("hides Edit and says why on another DM's library item, keeping Copy to campaign", async () => {
    mocks.route.query = {};
    ownersItem("owner");
    const wrapper = await mountView();
    const labels = actionLabels(wrapper);
    expect(labels.some((l) => l.includes("Edit"))).toBe(false);
    expect(labels.some((l) => l.includes("Copy to campaign"))).toBe(true);
    expect(wrapper.get('[data-testid="read-only-library-note"]').text()).toContain("Read only");
  });

  it("ignores ?edit=true for it: no editor, no Save, no Delete", async () => {
    mocks.route.query = { edit: "true" };
    ownersItem("owner");
    const wrapper = await mountView();
    expect(wrapper.findComponent({ name: "ItemDetail" }).exists()).toBe(false);
    const labels = actionLabels(wrapper);
    expect(labels.some((l) => /Save|Delete|Clone/.test(l))).toBe(false);
  });

  it("still opens the editor on the caller's own library item", async () => {
    mocks.route.query = { edit: "true" };
    ownersItem("me");
    const wrapper = await mountView();
    expect(wrapper.findComponent({ name: "ItemDetail" }).exists()).toBe(true);
  });
});

describe("ItemDetailView — a library item is read only", () => {
  beforeEach(() => {
    mocks.route.name = "item-detail";
    mocks.route.params = { id: "srd-sword" };
    mocks.route.query = {};
    mocks.item = { id: "srd-sword", name: "Longsword", item_type: "weapon", rarity: "common", campaign_id: null, user_id: "" };
    mocks.isShared = true;
    mocks.replace.mockReset();
    mocks.toastError.mockReset();
    mocks.customize.mockReset();
  });

  const cloneButton = (w: Awaited<ReturnType<typeof mountView>>) => w.findAll("button").find((b) => b.text().includes("Clone to customize"));

  it("never opens the editor for it, even with ?edit=true", async () => {
    mocks.route.query = { edit: "true" };
    const wrapper = await mountView();
    expect(wrapper.findComponent({ name: "ItemDetail" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "ItemSheet" }).exists()).toBe(true);
    expect(wrapper.findAll("button").some((b) => /Save|Delete/.test(b.text()))).toBe(false);
  });

  it("clones it to an editable copy and opens that copy in the editor", async () => {
    mocks.customize.mockResolvedValue({ id: "my-sword" });
    const wrapper = await mountView();
    await cloneButton(wrapper)!.trigger("click");
    await flushPromises();
    expect(mocks.customize).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/vault/my-sword?edit=true");
  });

  it("says so and stays on the library item when the clone fails", async () => {
    mocks.customize.mockRejectedValue(new Error("quota"));
    const wrapper = await mountView();
    await cloneButton(wrapper)!.trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("quota");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("ItemDetailView — view and edit toggle the address, keeping the rest of it", () => {
  beforeEach(() => {
    mocks.route.name = "item-detail";
    mocks.route.params = { id: "item-1" };
    mocks.item = { id: "item-1", name: "Longsword of Testing", item_type: "weapon", rarity: "uncommon", campaign_id: "c", user_id: "me" };
    mocks.isShared = false;
    mocks.userId = "me";
    mocks.replace.mockReset();
  });

  it("Edit adds the flag, View drops only the flag", async () => {
    mocks.route.query = { tab: "notes" };
    const viewing = await mountView();
    await viewing.findAll("button").find((b) => b.text().includes("Edit"))!.trigger("click");
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { tab: "notes", edit: "true" } });
    viewing.unmount();

    mocks.route.query = { tab: "notes", edit: "true" };
    const editing = await mountView();
    await editing.findAll("button").find((b) => b.text().includes("View"))!.trigger("click");
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { tab: "notes" } });
  });

  it("describes the item by type and rarity under its name", async () => {
    mocks.route.query = {};
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Weapon · Uncommon");
  });
});
