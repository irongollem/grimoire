import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const mocks = vi.hoisted(() => ({ replace: vi.fn(), scroll: vi.fn(), wide: { value: true }, destroy: vi.fn(), confirm: vi.fn() }));
const data = ref<CanonEntry[]>([]);

vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data, isLoading: ref(false), isError: ref(false) }),
  useDeleteCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useBreakpoint", () => ({ useAbove: () => mocks.wide }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { id: "c1" } }) }));

import CanonView from "./CanonView.vue";

const truth = (id: string, title: string): CanonEntry => ({
  id, user_id: "u", campaign_id: "c1", part: "truth", premise_kind: null, knowledge: "all", title, body: null,
  sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null, created_at: "", updated_at: "",
});

const TruthDetailStub = { name: "TruthDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='detail'>{{ entry.title }}<button data-testid='del' @click=\"$emit('delete')\" /></div>" };
const TruthsStub = {
  name: "TruthsSection",
  props: ["truths", "selectedId"],
  emits: ["select"],
  template: "<section><div v-for='t in truths' :id=\"'canon-entry-' + t.id\" :key='t.id' @click=\"$emit('select', t.id)\">{{ t.title }}</div></section>",
};

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const w = mount(CanonView, {
    attachTo: document.body,
    global: { stubs: { PremiseSection: true, TruthDetail: TruthDetailStub, TruthsSection: TruthsStub, CanonContents: true } },
  });
  mounted.push(w);
  return w;
}

describe("CanonView", () => {
  // Attached to the document (the scroll looks the row up by id), so each one is taken down again.
  afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

  beforeEach(() => {
    route.query = {};
    data.value = [truth("t1", "The river gives back."), truth("t2", "The Stain is a wound.")];
    mocks.replace.mockReset();
    mocks.destroy.mockReset();
    mocks.confirm.mockReset();
    mocks.scroll.mockReset();
    mocks.wide.value = true;
    Element.prototype.scrollIntoView = mocks.scroll;
  });

  it("opens the truth named by ?entry=<id> and scrolls it into view, the link search and the world web follow", async () => {
    route.query = { entry: "t2" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=detail]").text()).toBe("The Stain is a wound.");
    expect(mocks.scroll).toHaveBeenCalledTimes(1);
  });

  it("opens nothing for an id that is not a truth of this campaign", async () => {
    route.query = { entry: "someone-elses" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  it("opens nothing without ?entry", async () => {
    expect(mountView().find("[data-testid=detail]").exists()).toBe(false);
  });

  it("puts a clicked truth in the URL without scrolling the list away from the DM's hand", async () => {
    const w = mountView();
    await w.find("#canon-entry-t1").trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: "t1" } });
    route.query = { entry: "t1" };
    await flushPromises();
    expect(mocks.scroll).not.toHaveBeenCalled();
  });

  it("shows the selected truth once, in the side column on a desktop and under its part on a phone", async () => {
    route.query = { entry: "t1" };
    expect(mountView().findAll("[data-testid=detail]")).toHaveLength(1);
    mocks.wide.value = false;
    expect(mountView().findAll("[data-testid=detail]")).toHaveLength(1);
  });

  describe("deleting the open truth", () => {
    async function openAndDelete() {
      route.query = { entry: "t1" };
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=del]").trigger("click");
      await flushPromises();
    }

    it("deletes nothing when the confirm is cancelled", async () => {
      mocks.confirm.mockResolvedValue(false);
      await openAndDelete();
      expect(mocks.destroy).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("keeps the truth open when the delete fails", async () => {
      mocks.confirm.mockResolvedValue(true);
      mocks.destroy.mockRejectedValue(new Error("no"));
      await openAndDelete();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("deletes it and clears ?entry, going nowhere else", async () => {
      mocks.confirm.mockResolvedValue(true);
      mocks.destroy.mockResolvedValue(undefined);
      await openAndDelete();
      expect(mocks.destroy).toHaveBeenCalledWith("t1");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined } });
    });
  });
});
