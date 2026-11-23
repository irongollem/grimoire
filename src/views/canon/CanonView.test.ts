import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const mocks = vi.hoisted(() => ({ replace: vi.fn(), scroll: vi.fn(), wide: { value: true }, destroy: vi.fn(), confirm: vi.fn() }));
const data = ref<CanonEntry[]>([]);
const tableFacts = ref<unknown[]>([]);
const party = ref([{ id: "m1", name: "Tansy" }, { id: "m2", name: "Pim" }]);

vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data, isLoading: ref(false), isError: ref(false) }),
  useDeleteCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useChronicle", () => ({ useChronicle: () => ({ written: ref(3) }) }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts: { data: tableFacts } }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useBreakpoint", () => ({ useAbove: () => mocks.wide }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { id: "c1" } }) }));

import CanonView from "./CanonView.vue";

const truth = (id: string, title: string): CanonEntry => canonEntry({ id, campaign_id: "c1", part: "truth", knowledge: "all", title });

const TruthDetailStub = { name: "TruthDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='detail'>{{ entry.title }}<button data-testid='del' @click=\"$emit('delete')\" /></div>" };
const TruthsStub = {
  name: "TruthsSection",
  props: ["truths", "selectedId"],
  emits: ["select"],
  template: "<section id=\"canon-truths\"><div v-for='t in truths' :id=\"'canon-entry-' + t.id\" :key='t.id' @click=\"$emit('select', t.id)\">{{ t.title }}</div></section>",
};

const SecretDetailStub = { name: "SecretDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='secret-detail'>{{ entry.title }}<button data-testid='del-secret' @click=\"$emit('delete')\" /></div>" };

const ForceDetailStub = { name: "ForceDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='force-detail'>{{ entry.title }}<button data-testid='del-force' @click=\"$emit('delete')\" /></div>" };

const LoreDetailStub = { name: "LoreDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='lore-detail'>{{ entry.title }}<button data-testid='del-lore' @click=\"$emit('delete')\" /></div>" };

const BackstoryDetailStub = { name: "BackstoryDetail", props: ["member"], template: "<div data-testid='backstory-detail'>{{ member.name }}</div>" };

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const w = mount(CanonView, {
    attachTo: document.body,
    global: { stubs: { PremiseSection: true, ForcesSection: true, ForceDetail: ForceDetailStub, SecretsSection: true, WorldWorksSection: true, LoreSection: true, ChronicleSection: true, TableAddedSection: true, AppButton: { template: '<a data-testid="bring-in" :href="to"><slot /></a>', props: ['to'] }, LoreDetail: LoreDetailStub, SecretDetail: SecretDetailStub, TruthDetail: TruthDetailStub, TruthsSection: TruthsStub, CanonContents: true, BackstoriesSection: true, BackstoryDetail: BackstoryDetailStub } },
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

  it("opens the secret named by ?entry=<id> with the secret's detail, not a truth's, so a clue's link lands on its secret", async () => {
    data.value = [...data.value, { ...truth("s1", "Sift is the guild master's daughter."), part: "secret", knowledge: null }];
    route.query = { entry: "s1" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=secret-detail]").text()).toBe("Sift is the guild master's daughter.");
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  it("opens the force named by ?entry=<id> with the force's detail, so a link from a quest lands on what is moving", async () => {
    data.value = [...data.value, { ...truth("f1", "The Stain spreads"), part: "force", knowledge: null }];
    route.query = { entry: "f1" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=force-detail]").text()).toBe("The Stain spreads");
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  it("opens the lore entry named by ?entry=<id> with the lore detail, so a link from a passage lands on its entry", async () => {
    data.value = [canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall of the Bakers' Guild" })];
    route.query = { entry: "l1" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=lore-detail]").text()).toBe("The Fall of the Bakers' Guild");
  });

  it("asks with the lore's own wording, naming its passages, when the open entry is lore", async () => {
    data.value = [canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall" })];
    route.query = { entry: "l1" };
    mocks.confirm.mockResolvedValue(false);
    const w = mountView();
    await flushPromises();
    await w.find("[data-testid=del-lore]").trigger("click");
    expect(mocks.confirm.mock.calls[0]![0]).toContain("passages");
  });

  // Bug caught: a character with no backstory entry yet could not be opened, since the page only knew entries, so the
  // DM could not start one from the list of characters.
  it("opens a character's backstory from ?backstory=<party member>, before any entry exists for it", async () => {
    route.query = { backstory: "m2" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=backstory-detail]").text()).toBe("Pim");
  });

  // Bug caught: Ask Grimoire's "Review suggestions" landed on the top of the Canon page, with the suggested truths
  // somewhere far down it, so the DM saw nothing had happened.
  it("scrolls to the part named by ?section= once the page has loaded, and ignores a part that does not exist", async () => {
    route.query = { section: "truths" };
    const w = mountView();
    await flushPromises();
    expect(mocks.scroll).toHaveBeenCalledTimes(1);
    expect(mocks.scroll.mock.contexts[0]).toBe(document.getElementById("canon-truths"));
    w.unmount();
    mounted.pop();
    mocks.scroll.mockReset();
    route.query = { section: "not-a-part" };
    mountView();
    await flushPromises();
    expect(mocks.scroll).not.toHaveBeenCalled();
  });

  // Bug caught: a search result or web link to a backstory entry opened nothing.
  it("opens the character a backstory entry belongs to from ?entry=<entry id>", async () => {
    data.value = [canonEntry({ id: "b1", campaign_id: "c1", part: "backstory", party_member_id: "m1", title: "" })];
    route.query = { entry: "b1" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=backstory-detail]").text()).toBe("Tansy");
  });

  it("opens nothing for a backstory of a character who is not in the party", async () => {
    route.query = { backstory: "gone" };
    const w = mountView();
    await flushPromises();
    expect(w.find("[data-testid=backstory-detail]").exists()).toBe(false);
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

    it("asks with the secret's own wording, naming its clues, when the open entry is a secret", async () => {
      data.value = [{ ...truth("s1", "Sift is the guild master's daughter."), part: "secret", knowledge: null }];
      route.query = { entry: "s1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=del-secret]").trigger("click");
      expect(mocks.confirm.mock.calls[0][0]).toContain("Delete this secret?");
      expect(mocks.confirm.mock.calls[0][0]).toContain("clues");
    });

    it("asks with the force's own wording, naming its steps, ticks and quest links, when the open entry is a force", async () => {
      data.value = [{ ...truth("f1", "The Stain spreads"), part: "force", knowledge: null }];
      route.query = { entry: "f1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=del-force]").trigger("click");
      expect(mocks.confirm.mock.calls[0][0]).toContain("Delete this force?");
      expect(mocks.confirm.mock.calls[0][0]).toContain("steps, ticks and quest links");
    });

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

  // Bug caught: the importer left Campaign settings with no way in from the Canon page, so a DM could not bring a book in at all.
  it("offers Bring in a book, leading to the import page", () => {
    const w = mountView();
    expect(w.find("[data-testid=bring-in]").attributes("href")).toBe("/canon/import");
  });

  // Bug caught: the contents column counting kept, struck and corrected lines as "new", so the badge never reached zero.
  it("hands the contents the chronicle's written entries and only the table's unreviewed lines", () => {
    const fact = (id: string, over: Record<string, unknown> = {}) => ({ id, source: "table", supersedes_id: null, kept_at: null, struck_at: null, created_at: `2026-11-20T10:00:0${id}Z`, ...over });
    tableFacts.value = [fact("1"), fact("2", { kept_at: "2026-11-20T11:00:00Z" }), fact("3", { struck_at: "2026-11-20T11:00:00Z" }), fact("4")];
    const counts = mountView().findComponent({ name: "CanonContents" }).props("counts") as Record<string, number>;
    expect(counts.table).toBe(2);
    expect(counts.chronicle).toBe(3);
  });

  // Bug caught: the contents column counting only the backstories already opened, so a party of two read "0" over a ledger of two rows.
  it("counts one backstory per character, opened or not", () => {
    const counts = mountView().findComponent({ name: "CanonContents" }).props("counts") as Record<string, number>;
    expect(counts.backstories).toBe(2);
  });
});
