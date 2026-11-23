import { afterEach, beforeEach, describe, expect, it, vi, onTestFinished } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const mocks = vi.hoisted(() => ({ replace: vi.fn(), scroll: vi.fn(), destroy: vi.fn(), confirm: vi.fn() }));
const wide = ref(true);
const data = ref<CanonEntry[]>([]);
const tableFacts = ref<unknown[]>([]);
const party = ref([{ id: "m1", name: "Tansy" }, { id: "m2", name: "Pim" }]);

vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data, isLoading: ref(false), isError: ref(false) }),
  useTrashCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useChronicle", () => ({ useChronicle: () => ({ written: ref(3) }) }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts: { data: tableFacts } }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useBreakpoint", () => ({ useAbove: () => wide }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { id: "c1" } }) }));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import { useCanonUiStore } from "@/stores/ui/canon";
import CanonView from "./CanonView.vue";

const truth = (id: string, title: string): CanonEntry => canonEntry({ id, campaign_id: "c1", part: "truth", knowledge: "all", title });

const TruthDetailStub = { name: "TruthDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='detail'>{{ entry.title }}<button data-testid='del' @click=\"$emit('delete')\" /></div>" };
const TruthsStub = {
  name: "TruthsSection",
  props: ["truths", "selectedId"],
  emits: ["select"],
  template: "<section><div v-for='t in truths' :id=\"'canon-entry-' + t.id\" :key='t.id' @click=\"$emit('select', t.id)\">{{ t.title }}</div></section>",
};

const SecretDetailStub = { name: "SecretDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='secret-detail'>{{ entry.title }}<button data-testid='del-secret' @click=\"$emit('delete')\" /></div>" };

const ForceDetailStub = { name: "ForceDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='force-detail'>{{ entry.title }}<button data-testid='del-force' @click=\"$emit('delete')\" /></div>" };

const LoreDetailStub = { name: "LoreDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='lore-detail'>{{ entry.title }}<button data-testid='del-lore' @click=\"$emit('delete')\" /></div>" };

const BackstoryDetailStub = { name: "BackstoryDetail", props: ["member"], template: "<div data-testid='backstory-detail'>{{ member.name }}</div>" };

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const w = mount(CanonView, {
    attachTo: document.body,
    global: { stubs: { CanonArcs: true, PremiseSection: true, ForcesSection: true, ForceDetail: ForceDetailStub, SecretsSection: true, WorldWorksSection: true, LifeSection: true, LoreSection: true, ChronicleSection: true, TableAddedSection: true, CanonDeleted: true, AppButton: { template: '<a :data-testid="label === \'Tonight\' ? \'tonight\' : \'bring-in\'" :href="to"><slot /></a>', props: ['to', 'label'] }, LoreDetail: LoreDetailStub, SecretDetail: SecretDetailStub, TruthDetail: TruthDetailStub, TruthsSection: TruthsStub, CanonContents: true, BackstoriesSection: true, BackstoryDetail: BackstoryDetailStub } },
  });
  mounted.push(w);
  return w;
}

describe("CanonView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  // Attached to the document (the scroll looks the row up by id), so each one is taken down again.
  afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

  beforeEach(() => {
    route.query = {};
    data.value = [truth("t1", "The river gives back."), truth("t2", "The Stain is a wound.")];
    mocks.replace.mockReset();
    mocks.destroy.mockReset();
    mocks.confirm.mockReset();
    mocks.scroll.mockReset();
    wide.value = true;
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

  // Bug caught: a lore entry or a force edited in the 20rem side pane (rich text wrapping every few words, a ribbon of steps).
  describe("a long entry opens beside its ledger in the page body, never in the side pane", () => {
    const forceRow = () => ({ ...truth("f1", "The Stain spreads"), part: "force" as const, knowledge: null });
    const loreRow = () => canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall" });

    it("renders a selected lore entry in the body's split and not in the aside, at desktop width", async () => {
      data.value = [loreRow()];
      route.query = { entry: "l1" };
      const w = mountView();
      await flushPromises();
      expect(w.find("[data-testid=page-body] [data-testid=canon-split-detail] [data-testid=lore-detail]").exists()).toBe(true);
      expect(w.find("aside").exists()).toBe(false);
    });

    it("renders a selected force in the body's split and not in the aside", async () => {
      data.value = [forceRow()];
      route.query = { entry: "f1" };
      const w = mountView();
      await flushPromises();
      expect(w.find("[data-testid=page-body] [data-testid=canon-split-detail] [data-testid=force-detail]").exists()).toBe(true);
      expect(w.find("aside").exists()).toBe(false);
    });

    // Bug caught: moving lore and forces out also moved the truth, or left it unrendered.
    it("keeps a selected truth and a selected secret in the aside at desktop width", async () => {
      route.query = { entry: "t1" };
      const truthView = mountView();
      await flushPromises();
      expect(truthView.find("aside [data-testid=detail]").exists()).toBe(true);
      expect(truthView.find("[data-testid=canon-split-detail]").exists()).toBe(false);
      data.value = [{ ...truth("s1", "Sift"), part: "secret", knowledge: null }];
      route.query = { entry: "s1" };
      const secretView = mountView();
      await flushPromises();
      expect(secretView.find("aside [data-testid=secret-detail]").exists()).toBe(true);
    });

    // Bug caught: the body stayed 48rem wide with a split open, so two thirds of it was no wider than before.
    it("widens the page body only while a split is open, for a lore entry, a force and a backstory alike", async () => {
      const closed = mountView();
      await flushPromises();
      expect(closed.find("[data-testid=page-body] > div > div").classes()).not.toContain("max-w-5xl");
      for (const [rows, query] of [[[loreRow()], { entry: "l1" }], [[forceRow()], { entry: "f1" }], [data.value, { backstory: "m1" }]] as const) {
        data.value = [...rows];
        route.query = { ...query };
        const open = mountView();
        await flushPromises();
        expect(open.find("[data-testid=page-body] > div > div").classes()).toContain("max-w-5xl");
      }
    });

    // Bug caught: the close button did nothing, or cleared only ?backstory so a backstory opened by ?entry stayed open.
    it("closes an open lore entry by clearing ?entry", async () => {
      data.value = [loreRow()];
      route.query = { entry: "l1" };
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=canon-split-close]").trigger("click");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined, backstory: undefined } });
    });

    it("closes an open backstory by clearing ?backstory", async () => {
      route.query = { backstory: "m2" };
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=canon-split-close]").trigger("click");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined, backstory: undefined } });
    });

    // Bug caught: a deep link to a lore entry landed on the wrong part of the contents column.
    it("sets the Lore part active for a deep link to a lore entry", async () => {
      data.value = [loreRow()];
      route.query = { entry: "l1" };
      const w = mountView();
      await flushPromises();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
    });

    // Bug caught: the split's detail lost the id the tap-scroll looks for, so on a phone a tapped lore row opened off screen.
    it("scrolls a tapped lore row's entry into view, at any width", async () => {
      data.value = [loreRow()];
      const loreStub = { name: "LoreSection", props: ["lore"], emits: ["select"], template: "<section><i id='tap-lore' @click=\"$emit('select', 'l1')\" /></section>" };
      const w = mount(CanonView, {
        attachTo: document.body,
        global: { stubs: { CanonArcs: true, PremiseSection: true, ForcesSection: true, SecretsSection: true, WorldWorksSection: true, LifeSection: true, LoreSection: loreStub, LoreDetail: LoreDetailStub, ChronicleSection: true, TableAddedSection: true, CanonDeleted: true, TruthsSection: true, CanonContents: true, BackstoriesSection: true, AppButton: true } },
      });
      mounted.push(w);
      await w.find("#tap-lore").trigger("click");
      route.query = { entry: "l1" };
      await flushPromises();
      expect(mocks.scroll.mock.contexts.at(-1)).toBe(document.getElementById("canon-inline-detail"));
    });
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
    wide.value = false;
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

    // Bug caught (#1258 item 32): the lore delete asked "Delete this lore?", a noun that is not what the DM sees (a lore entry).
    it("asks with the lore entry's own wording, naming its passages", async () => {
      data.value = [{ ...truth("l1", "The founding"), part: "lore", knowledge: null }];
      route.query = { entry: "l1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await flushPromises();
      await w.find("[data-testid=del-lore]").trigger("click");
      expect(mocks.confirm.mock.calls[0][0]).toContain("Delete this lore entry?");
      expect(mocks.confirm.mock.calls[0][0]).toContain("and passages");
      expect(mocks.confirm.mock.calls[0][1]).toMatchObject({ title: "Delete this lore entry" });
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
      // Bug caught: the confirm still said "removed" after the delete became a move to the Deleted list.
      expect(mocks.confirm.mock.calls[0][0]).toContain("Deleted for thirty days");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined } });
    });
  });

  // Bug caught (#1255 item 17): a delete was permanent because the Deleted list, where Restore lives, was never on the page.
  it("mounts the Deleted list under what the table added", () => {
    const w = mountView();
    expect(w.findComponent({ name: "CanonDeleted" }).exists()).toBe(true);
  });

  // Bug caught: the importer left Campaign settings with no way in from the Canon page, so a DM could not bring a book in at all.
  it("offers Bring in a book, leading to the import page", () => {
    const w = mountView();
    expect(w.find("[data-testid=bring-in]").attributes("href")).toBe("/canon/import");
  });

  // Bug caught: the prep view built but unreachable, because the Canon header never linked to it.
  it("offers Tonight in the header and in the phone actions, leading to /canon/tonight", () => {
    const w = mountView();
    const links = w.findAll("[data-testid=tonight]");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.attributes("href"))).toEqual(["/canon/tonight", "/canon/tonight"]);
  });

  // Bug caught (#1258 item 20): Tonight and Bring in a book sat at the very bottom of the page on a phone, past every part.
  it("puts the phone actions under the title, before the contents and every part, and only on a phone", () => {
    const w = mountView();
    const actions = w.get("[data-testid=canon-phone-actions]");
    expect(actions.classes()).toContain("md:hidden");
    expect(actions.find("[data-testid=tonight]").exists()).toBe(true);
    expect(actions.find("[data-testid=bring-in]").exists()).toBe(true);
    const html = w.html();
    expect(html.indexOf("canon-phone-actions")).toBeLessThan(html.indexOf("canon-contents-stub"));
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

  // Bug caught: a search hit on an open question or a premise entry opened the page with nothing scrolled to or marked,
  // because the page only resolved truth, force, secret and lore.
  describe("landing on an entry with no detail pane", () => {
    const rowStub = { props: ["entries", "questions"], template: "<section><i v-for='e in (entries ?? questions)' :id=\"'canon-entry-' + e.id\" :key='e.id' /></section>" };
    function mountLanding() {
      const w = mount(CanonView, {
        attachTo: document.body,
        global: { stubs: { CanonArcs: true, PremiseSection: rowStub, SecretsSection: rowStub, TruthsSection: true, ForcesSection: true, WorldWorksSection: true, LifeSection: true, LoreSection: true, ChronicleSection: true, TableAddedSection: true, CanonDeleted: true, AppButton: true, CanonContents: true, BackstoriesSection: true } },
      });
      mounted.push(w);
      return w;
    }

    // Bug caught (#1255 item 14): Tonight's link to "What the table added" landed at the top of the page, because
    // nothing read which part a link meant.
    it("opens at the part named by ?section, and ignores a part that does not exist", async () => {
      // The parts are stubbed here, so the part's element is put on the page by hand.
      const part = document.createElement("div");
      part.id = "canon-table";
      document.body.appendChild(part);
      onTestFinished(() => part.remove());
      route.query = { section: "table" };
      const w = mountLanding();
      await flushPromises();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("table");
      expect(mocks.scroll.mock.contexts[0]).toBe(part);

      mocks.scroll.mockClear();
      route.query = { section: "nowhere" };
      await flushPromises();
      expect(mocks.scroll).not.toHaveBeenCalled();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("table");
    });

    it("sets Secrets active and scrolls to the open question named by ?entry", async () => {
      data.value = [canonEntry({ id: "q1", campaign_id: "c1", part: "question", title: "Who burned the mill?" })];
      route.query = { entry: "q1" };
      const w = mountLanding();
      await flushPromises();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("secrets");
      expect(mocks.scroll).toHaveBeenCalledTimes(1);
      expect(mocks.scroll.mock.contexts[0]).toBe(document.getElementById("canon-entry-q1"));
    });

    it("sets Premise active, scrolls to a theme entry and marks it for a moment", async () => {
      vi.useFakeTimers();
      try {
        data.value = [canonEntry({ id: "p1", campaign_id: "c1", part: "premise", premise_kind: "theme", title: "Dread" })];
        route.query = { entry: "p1" };
        const w = mountLanding();
        await flushPromises();
        const row = document.getElementById("canon-entry-p1")!;
        expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("premise");
        expect(mocks.scroll.mock.contexts[0]).toBe(row);
        expect(row.classList.contains("ring-primary")).toBe(true);
        vi.advanceTimersByTime(2500);
        expect(row.classList.contains("ring-primary")).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Bug caught: below a desktop a tapped row opened its detail under the part, off screen, and nothing brought it into view.
  describe("a tapped row on a phone", () => {
    it("scrolls the opened inline detail into view", async () => {
      wide.value = false;
      const w = mountView();
      await w.find("#canon-entry-t1").trigger("click");
      route.query = { entry: "t1" };
      await flushPromises();
      expect(mocks.scroll).toHaveBeenCalledTimes(1);
      expect(mocks.scroll.mock.contexts[0]).toBe(document.getElementById("canon-inline-detail"));
    });

    it("does not scroll at desktop width, where the side column already shows it", async () => {
      const w = mountView();
      await w.find("#canon-entry-t1").trigger("click");
      route.query = { entry: "t1" };
      await flushPromises();
      expect(mocks.scroll).not.toHaveBeenCalled();
    });
  });

  // Bug caught (#1255 item 11): the arc filter narrowing only some parts, or narrowing the premise, which belongs to no arc.
  describe("narrowed to an arc", () => {
    const inArc = (e: CanonEntry): CanonEntry => ({ ...e, arc_id: "a1" });
    beforeEach(() => {
      data.value = [
        inArc(truth("t1", "The river gives back.")),
        truth("t2", "The Stain is a wound."),
        canonEntry({ id: "p1", campaign_id: "c1", part: "premise", premise_kind: "theme", title: "Rot" }),
        inArc(canonEntry({ id: "b1", campaign_id: "c1", part: "backstory", party_member_id: "m1" })),
        canonEntry({ id: "b2", campaign_id: "c1", part: "backstory", party_member_id: "m2", arc_id: "a2" }),
      ];
      useCanonUiStore().arcFilter = "a1";
    });

    it("shows only the arc's truths, and still the whole premise", async () => {
      const w = mountView();
      await flushPromises();
      expect(w.findComponent({ name: "TruthsSection" }).props("truths").map((t: CanonEntry) => t.id)).toEqual(["t1"]);
      expect(w.findComponent({ name: "PremiseSection" }).props("entries").map((t: CanonEntry) => t.id)).toContain("p1");
    });

    // Bug caught (#1258 item 29): the arc hiding a character whose backstory is in another arc, or who has none yet. A
    // character spans arcs, so the Backstories part lists the whole party under any arc.
    it("lists every character under an arc, whatever arc their backstory is in", async () => {
      party.value = [...party.value, { id: "m3", name: "Wren" }];
      const w = mountView();
      await flushPromises();
      expect(w.findComponent({ name: "BackstoriesSection" }).props("party").map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3"]);
      party.value = party.value.slice(0, 2);
    });

    it("counts the contents column by what the arc shows, and 'Where to begin' by the whole canon", async () => {
      const w = mountView();
      await flushPromises();
      expect(w.findComponent({ name: "CanonContents" }).props("counts")).toMatchObject({ truths: 1, premise: 1, backstories: 2 });
      expect(w.findComponent({ name: "CanonStart" }).props("counts")).toMatchObject({ truths: 2, backstories: 2 });
    });

    it("keeps a truth open when the DM moves it to another arc, instead of closing it under them", async () => {
      route.query = { entry: "t2" };
      const w = mountView();
      await flushPromises();
      expect(w.find("[data-testid=detail]").text()).toBe("The Stain is a wound.");
    });
  });
});
