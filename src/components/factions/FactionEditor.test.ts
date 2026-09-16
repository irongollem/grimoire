import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
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
