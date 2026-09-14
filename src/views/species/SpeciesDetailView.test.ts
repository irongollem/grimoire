import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive, ref, defineComponent, h } from "vue";
import SpeciesDetailView from "./SpeciesDetailView.vue";
import type { Species } from "@/types/species.types";

/**
 * Covers the Copy to campaign wiring (#598, wave 2) only — the rest of this
 * view (edit/clone/cancel) is exercised through SpeciesDetail.vue's own
 * tests. CopyToCampaignDialog is replaced with a minimal stand-in that
 * records the props it was given and lets a test fire `copied` on demand;
 * the dialog's own picker/plan/confirm behaviour is CopyToCampaignDialog.test.ts's
 * job, not this view's.
 */
const mocks = vi.hoisted(() => ({
  route: {
    name: "species-detail",
    params: { id: "species-1" },
    query: {} as Record<string, string>,
  },
  push: vi.fn(),
  replace: vi.fn(),
  species: {
    id: "species-1",
    name: "Testfolk",
    size: "medium",
    source: null,
    campaign_id: "campaign-1",
  } as Partial<Species>,
  isShared: false,
  cloneLibrary: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/composables/rules/useSpecies", () => ({
  useSpecies: () => ({ data: ref(mocks.species), isLoading: ref(false) }),
  useIsLibrarySpecies: () => ref(mocks.isShared),
  useCloneLibrarySpecies: () => ({ mutateAsync: mocks.cloneLibrary }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: mocks.toastSuccess,
    error: vi.fn(),
    fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  }),
}));

vi.mock("@/components/common/CopyToCampaignDialog.vue", () => ({
  default: defineComponent({
    name: "CopyToCampaignDialog",
    props: ["open", "table", "ids", "sourceCampaignId", "label", "labelPlural"],
    emits: ["close", "copied"],
    setup(props) {
      return () => (props.open ? h("div", { class: "copy-dialog-stub" }) : null);
    },
  }),
}));

// PageHeaderAction forwards `label` through $attrs to AppButton rather than
// declaring it as its own prop, so a PageHeaderAction wrapper's `.props()`
// never carries it — find the AppButton it renders instead (same idiom as
// ItemDetailView.test.ts's findButton, reused here for both AppButton- and
// PageHeaderAction-rendered actions since they converge on the same button).
function findButton(wrapper: ReturnType<typeof mountView>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

function mountView() {
  return mount(SpeciesDetailView, {
    global: {
      stubs: {
        SpeciesDetail: true,
        SpeciesSheet: true,
        LoadingSpinner: true,
        // A plain `true` auto-stub falls through an undeclared prop as a DOM
        // attribute — fine for the plain data `SpeciesSheet` gets, but
        // `detail-ref` carries a live component-instance proxy once
        // SpeciesDetail (also stubbed) mounts, and happy-dom's setAttribute
        // can't coerce that to a string. Declaring the prop here keeps it
        // out of the DOM instead.
        DetailActions: { template: "<div />", props: ["detailRef", "exists"] },
      },
    },
  });
}

describe("SpeciesDetailView — copy to campaign (#598)", () => {
  beforeEach(() => {
    mocks.route.name = "species-detail";
    mocks.route.params = { id: "species-1" };
    mocks.route.query = {};
    mocks.species = {
      id: "species-1",
      name: "Testfolk",
      size: "medium",
      source: null,
      campaign_id: "campaign-1",
    };
    mocks.isShared = false;
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.toastSuccess.mockClear();
  });

  it("offers Copy to campaign… for an owned species, wired to the species' own scope and the irregular plural", () => {
    const wrapper = mountView();
    const action = findButton(wrapper, "Copy to campaign…");
    expect(action).toBeTruthy();

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    expect(dialog.props("open")).toBe(false);
    expect(dialog.props("table")).toBe("species");
    expect(dialog.props("ids")).toEqual(["species-1"]);
    expect(dialog.props("sourceCampaignId")).toBe("campaign-1");
    expect(dialog.props("label")).toBe("species");
    expect(dialog.props("labelPlural")).toBe("species");
  });

  it("clicking the action opens the dialog", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(true);
  });

  it("does not offer Copy to campaign… for a shared/library species (Clone to customize instead)", () => {
    mocks.isShared = true;
    const wrapper = mountView();
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
    expect(findButton(wrapper, "Clone to customize")).toBeTruthy();
  });

  it("does not offer Copy to campaign… while editing (Save/Cancel own the header instead)", () => {
    mocks.route.query = { edit: "true" };
    const wrapper = mountView();
    expect(findButton(wrapper, "Copy to campaign…")).toBeUndefined();
    expect(findButton(wrapper, "Cancel")).toBeTruthy();
  });

  it("a copied event toasts the species name and destination, closes the dialog, and never navigates", async () => {
    const wrapper = mountView();
    await findButton(wrapper, "Copy to campaign…")!.trigger("click");

    const dialog = wrapper.findComponent({ name: "CopyToCampaignDialog" });
    await dialog.vm.$emit("copied", { copied: 1, targetName: "Icewind Dale" });

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Copied "Testfolk" to Icewind Dale.');
    expect(wrapper.findComponent({ name: "CopyToCampaignDialog" }).props("open")).toBe(false);
    // The copy lands in another campaign, which this page cannot show — no
    // navigation follows it, unlike Clone to customize above.
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
