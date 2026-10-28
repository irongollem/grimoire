import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import FactionEditor from "./FactionEditor.vue";
import type { Faction } from "@/types/faction.types";

/**
 * Covers the Copy to campaign wiring (#885) only. FactionEditor's own save/
 * delete/upload behaviour is out of scope here — every other composable it
 * touches is stubbed to the minimum that lets the component mount.
 * CopyToCampaignDialog is replaced with a minimal stand-in that records the
 * props it was given and lets a test fire `copied` / `quota-exceeded` on
 * demand — the dialog's own picker/plan/confirm behaviour is
 * CopyToCampaignDialog.test.ts's job, not this component's.
 *
 * Unlike NPCs, factions have no separate mobile editor layer — this one
 * editor serves both widths, so there is exactly one "Copy to campaign…"
 * button to cover.
 */

function faction(overrides: Partial<Faction> = {}): Faction {
  return {
    id: "faction-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    name: "The Iron Circle",
    faction_type: "Guild",
    description: null,
    emblem_url: null,
    alignment: null,
    player_visible_to: [],
    tags: [],
    setting_source: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Faction;
}

const routerPush = vi.fn();
const routerReplace = vi.fn();
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock("@/composables/useImageUpload", () => ({
  useImageUpload: () => ({ upload: vi.fn() }),
}));

const createFaction = vi.fn();
const updateFaction = vi.fn();
const deleteFaction = vi.fn();
vi.mock("@/composables/factions/useFactions", () => ({
  useCreateFaction: () => ({ mutateAsync: createFaction }),
  useUpdateFaction: () => ({ mutateAsync: updateFaction }),
  useDeleteFaction: () => ({ mutateAsync: deleteFaction }),
}));

// FactionEditor now passes @mention items to its description RichTextEditor
// (epic #932, story 3); mocked at this boundary rather than pulling in the
// five composables useEntityMentionItems fans out to (party/npcs/monsters/
// locations/factions), none of which this file otherwise sets up.
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({ mentionItems: [] }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [{ id: "loc-1", name: "Thornkeep", depth: 0 }] } }),
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

function findButton(wrapper: ReturnType<typeof mountEditor>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

function mountEditor(factionProp: Faction | null, isNew = false) {
  return mount(FactionEditor, {
    props: { faction: factionProp, isNew },
    global: {
      stubs: {
        EntityCombobox: true,
        AudienceRevealControl: true,
        TagInput: true,
        RichTextEditor: true,
        FocalImage: true,
        AiImageBadge: true,
        PaywallModal: true,
      },
    },
  });
}

describe("FactionEditor — copy to campaign (#885)", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
    toastSuccess.mockClear();
  });

  it("offers Copy to campaign… for an existing faction", () => {
    const wrapper = mountEditor(faction());
    const button = findButton(wrapper, "Copy to campaign…");
    expect(button).toBeTruthy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("factions");
    expect(dialog.props("ids")).toEqual(["faction-1"]);
    expect(dialog.props("label")).toBe("faction");
  });

  it("clicking the action opens the dialog", async () => {
    const wrapper = mountEditor(faction());
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer Copy to campaign… for a brand-new (unsaved) faction", () => {
    const wrapper = mountEditor(null, true);
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).exists()).toBe(false);
  });

  it("a copied event toasts the faction name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = mountEditor(faction({ name: "The Iron Circle" }));
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(toastSuccess).toHaveBeenCalledWith('Copied "The Iron Circle" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // create-style navigation follows it, unlike Save above.
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("a quota-exceeded event closes the dialog and opens a dedicated paywall, distinct from the list's create-gate one", async () => {
    const wrapper = mountEditor(faction());
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("quota-exceeded");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(wrapper.findAllComponents({ name: "PaywallModal" })).toHaveLength(1);
  });
});

describe("FactionEditor — descent (#1083)", () => {
  const pick = (w: ReturnType<typeof mountEditor>, type: string) =>
    w.findAllComponents({ name: "EntityCombobox" })[0]?.vm.$emit("update:modelValue", type);

  it("shows Descent only for a House", async () => {
    const w = mountEditor(faction({ faction_type: "Guild" }));
    expect(w.find("#faction-descent").exists()).toBe(false);
    pick(w, "House");
    await w.vm.$nextTick();
    expect(w.find("#faction-descent").exists()).toBe(true);
    expect((w.find("#faction-descent").element as HTMLSelectElement).value).toBe("either");
  });

  it("clears the descent when the type moves away from House, and saves it for a House", async () => {
    const w = mountEditor(faction({ faction_type: "House", descent: "mother" }));
    expect((w.find("#faction-descent").element as HTMLSelectElement).value).toBe("mother");
    await w.find("#faction-descent").setValue("oath");
    await findButton(w, "Save")!.trigger("click");
    expect(updateFaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ descent: "oath" }) }),
    );
    pick(w, "Guild");
    await w.vm.$nextTick();
    expect(w.find("#faction-descent").exists()).toBe(false);
    await findButton(w, "Save")!.trigger("click");
    expect(updateFaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ descent: null }) }),
    );
  });
});

describe("FactionEditor — seat", () => {
  const combos = (w: ReturnType<typeof mountEditor>) => w.findAllComponents({ name: "EntityCombobox" });
  const seatBox = (w: ReturnType<typeof mountEditor>) => combos(w).find((c) => c.attributes("placeholder") === "No seat");

  it("shows Seat only for a House", async () => {
    const w = mountEditor(faction({ faction_type: "Guild" }));
    expect(seatBox(w)).toBeUndefined();
    combos(w)[0]?.vm.$emit("update:modelValue", "House");
    await w.vm.$nextTick();
    expect(seatBox(w)).toBeTruthy();
  });

  it("sends the seat for a House and null once the type changes", async () => {
    const w = mountEditor(faction({ faction_type: "House", descent: "either", seat_location_id: null }));
    seatBox(w)!.vm.$emit("update:modelValue", "loc-1");
    await w.vm.$nextTick();
    await findButton(w, "Save")!.trigger("click");
    expect(updateFaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ seat_location_id: "loc-1" }) }),
    );
    combos(w)[0]?.vm.$emit("update:modelValue", "Guild");
    await w.vm.$nextTick();
    await findButton(w, "Save")!.trigger("click");
    expect(updateFaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ seat_location_id: null }) }),
    );
  });
});

describe("FactionEditor — save, delete, cancel", () => {
  beforeEach(() => {
    routerPush.mockClear();
    createFaction.mockReset().mockResolvedValue(undefined);
    updateFaction.mockReset().mockResolvedValue(undefined);
    deleteFaction.mockReset().mockResolvedValue(undefined);
    confirmMock.mockReset();
    routeState.query = {};
  });
  const nameInput = (w: ReturnType<typeof mountEditor>) => ({
    setValue: (v: string) => w.findComponent({ name: "AppInput" }).setValue(v),
  });

  it("a new faction is created with its name trimmed and the DM lands on the list", async () => {
    const w = mountEditor(null, true);
    await nameInput(w).setValue("  The Silver Hand  ");
    await findButton(w, "Create")!.trigger("click");
    await flushPromises();
    expect(createFaction).toHaveBeenCalledWith(expect.objectContaining({ name: "The Silver Hand" }));
    expect(updateFaction).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/factions");
  });

  it("Create stays disabled while the name is blank", async () => {
    const w = mountEditor(null, true);
    await nameInput(w).setValue("   ");
    expect(findButton(w, "Create")!.props("disabled")).toBe(true);
    await findButton(w, "Create")!.trigger("click");
    expect(createFaction).not.toHaveBeenCalled();
  });

  it("an existing faction is updated by id, not created", async () => {
    const w = mountEditor(faction());
    await findButton(w, "Save")!.trigger("click");
    await flushPromises();
    expect(updateFaction).toHaveBeenCalledWith(expect.objectContaining({ id: "faction-1" }));
    expect(createFaction).not.toHaveBeenCalled();
  });

  it("a rejected save by quota opens the paywall and does not leave the editor", async () => {
    createFaction.mockRejectedValue({ message: "quota_exceeded" });
    const w = mountEditor(null, true);
    await nameInput(w).setValue("Ravens");
    await findButton(w, "Create")!.trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
    expect(findButton(w, "Create")!.props("disabled")).toBe(false);
  });

  it("cancelling the delete confirm keeps the faction", async () => {
    confirmMock.mockResolvedValue(false);
    const w = mountEditor(faction());
    await findButton(w, "Delete")!.trigger("click");
    await flushPromises();
    expect(deleteFaction).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("confirming the delete removes the faction and returns to the list", async () => {
    confirmMock.mockResolvedValue(true);
    const w = mountEditor(faction());
    await findButton(w, "Delete")!.trigger("click");
    await flushPromises();
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining("The Iron Circle"));
    expect(deleteFaction).toHaveBeenCalledWith("faction-1");
    expect(routerPush).toHaveBeenCalledWith("/factions");
  });

  it("Cancel drops ?edit but keeps the other query params", async () => {
    routeState.query = { edit: "true", tab: "members" };
    const w = mountEditor(faction());
    await findButton(w, "Cancel")!.trigger("click");
    expect(routerPush).toHaveBeenCalledWith({ query: { tab: "members" } });
  });
});
