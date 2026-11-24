import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const route = reactive<{ params: { part?: string }; query: Record<string, string> }>({ params: { part: "truths" }, query: {} });
const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), scroll: vi.fn(), destroy: vi.fn(), confirm: vi.fn() }));
// The router moves the route the way vue-router does: a path names the part, a query replaces the whole query.
const navigations = new Set<ReturnType<typeof setTimeout>>();
function later(to: Parameters<typeof go>[0]) {
  navigations.add(setTimeout(() => go(to), 0));
}
function go(to: { path?: string; query?: Record<string, string | undefined> }) {
  if (to.path !== undefined) route.params = { part: to.path.split("/")[2] };
  if (to.query) route.query = Object.fromEntries(Object.entries(to.query).filter(([, v]) => v !== undefined)) as Record<string, string>;
  else if (to.path !== undefined) route.query = {};
}
const loading = ref(false);
const data = ref<CanonEntry[]>([]);
const clues = ref<unknown[]>([]);
const forceData = ref<{ steps: unknown[] }>({ steps: [] });
const passages = ref<unknown[]>([]);
const party = ref([{ id: "m1", name: "Tansy" }, { id: "m2", name: "Pim" }]);

// Every jump on the page moves only its own scroller (scrollWithin), never the app shell around it.
vi.mock("@/lib/scrollParent", async (orig) => ({ ...(await orig<typeof import("@/lib/scrollParent")>()), scrollWithin: (el: Element) => mocks.scroll(el) }));
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({
    // The real router settles a navigation after the call returns, so the route moves on a later task here too.
    replace: (to: Parameters<typeof go>[0]) => { mocks.replace(to); later(to); return Promise.resolve(); },
    push: (to: Parameters<typeof go>[0]) => { mocks.push(to); later(to); return Promise.resolve(); },
  }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data, isLoading: loading, isError: ref(false) }),
  useTrashCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: passages }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: clues }) }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => ({ data: forceData }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { id: "c1" } }) }));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import { useCanonUiStore } from "@/stores/ui/canon";
import CanonView from "./CanonView.vue";

const truth = (id: string, title: string): CanonEntry => canonEntry({ id, campaign_id: "c1", part: "truth", knowledge: "all", title });

// The chapter draws its own list, entry wrapper and Back; this stub stands in for the rows and the open truth only.
const TruthsStub = {
  name: "TruthsChapter",
  props: ["truths", "allTruths", "selected", "arcLabel"],
  emits: ["select", "close", "delete"],
  template: "<section id=\"canon-truths\"><div v-for='t in truths' :id=\"'canon-entry-' + t.id\" :key='t.id' @click=\"$emit('select', t.id)\">{{ t.title }}</div><div v-if='selected' id='canon-inline-detail' data-testid='detail'>{{ selected.title }}<button data-testid='del' @click=\"$emit('delete')\" /><button data-testid='truth-close' @click=\"$emit('close')\" /></div></section>",
};

const SecretDetailStub = { name: "SecretDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='secret-detail'>{{ entry.title }}<button data-testid='del-secret' @click=\"$emit('delete')\" /></div>" };

const ForceDetailStub = { name: "ForceDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='force-detail'>{{ entry.title }}<button data-testid='del-force' @click=\"$emit('delete')\" /></div>" };

const LoreDetailStub = { name: "LoreDetail", props: ["entry"], emits: ["delete"], template: "<div data-testid='lore-detail'>{{ entry.title }}<button data-testid='del-lore' @click=\"$emit('delete')\" /></div>" };

const BackstoryDetailStub = { name: "BackstoryDetail", props: ["member"], template: "<div data-testid='backstory-detail'>{{ member.name }}</div>" };

const RouterLink = { props: ["to"], template: "<a :data-testid=\"typeof to === 'string' ? 'link' : 'result-link'\" :href=\"typeof to === 'string' ? to : `${to.path}?entry=${to.query.entry}`\"><slot /></a>" };

const mounted: { unmount: () => void }[] = [];

// The router above settles on a later task, so a test waits for that task and then for Vue.
async function settle() {
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(2);
  else await new Promise((resolve) => setTimeout(resolve, 2));
  await flushPromises();
}

// Every section and detail is another file's business; the page is what mounts them. Details are stubbed to a name and a delete.
const STUBS = {
  RouterLink, CanonArcs: true, PremiseSection: true, ForcesSection: true, ForceDetail: ForceDetailStub, SecretsSection: true, WorldWorksSection: true, WorldPeoples: true, HabitatsPanel: true,
  AppButton: { props: ["to", "label"], template: "<component :is=\"to ? 'a' : 'button'\" :href=\"to\">{{ label }}<slot /></component>" },
  LoreSection: true, CanonDeleted: true, LoreDetail: LoreDetailStub, SecretDetail: SecretDetailStub, TruthsChapter: TruthsStub, CanonContents: true, BackstoriesSection: true, BackstoryDetail: BackstoryDetailStub,
};

function mountView(stubs: Record<string, unknown> = {}) {
  const w = mount(CanonView, { attachTo: document.body, global: { stubs: { ...STUBS, ...stubs } } });
  mounted.push(w);
  return w;
}

describe("CanonView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  // Attached to the document (the scroll looks the row up by id), so each one is taken down again.
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    // A navigation still waiting when its test ended must not move the next test's route.
    navigations.forEach(clearTimeout);
    navigations.clear();
  });

  beforeEach(() => {
    route.query = {};
    route.params = { part: "truths" };
    localStorage.clear();
    clues.value = [];
    forceData.value = { steps: [] };
    passages.value = [];
    data.value = [truth("t1", "The river gives back."), truth("t2", "The Stain is a wound.")];
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.destroy.mockReset();
    mocks.confirm.mockReset();
    mocks.scroll.mockReset();
    loading.value = false;
  });

  it("opens the truth named by ?entry=<id> and scrolls it into view, the link search and the world web follow", async () => {
    route.query = { entry: "t2" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=detail]").text()).toBe("The Stain is a wound.");
    expect(mocks.scroll).toHaveBeenCalledTimes(1);
  });

  it("opens nothing for an id that is not a truth of this campaign", async () => {
    route.query = { entry: "someone-elses" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  it("opens the secret named by ?entry=<id> with the secret's detail, not a truth's, so a clue's link lands on its secret", async () => {
    data.value = [...data.value, { ...truth("s1", "Sift is the guild master's daughter."), part: "secret", knowledge: null }];
    route.params = { part: "secrets" };
    route.query = { entry: "s1" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=secret-detail]").text()).toBe("Sift is the guild master's daughter.");
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  it("opens the force named by ?entry=<id> with the force's detail, so a link from a quest lands on what is moving", async () => {
    data.value = [...data.value, { ...truth("f1", "The Stain spreads"), part: "force", knowledge: null }];
    route.params = { part: "moving" };
    route.query = { entry: "f1" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=force-detail]").text()).toBe("The Stain spreads");
    expect(w.find("[data-testid=detail]").exists()).toBe(false);
  });

  // Bug caught: an entry drawn under its list, in a side column, or nowhere: every chapter's entry opens in the chapter, beside its list.
  describe("an entry opens in its chapter, beside the list", () => {
    const forceRow = () => ({ ...truth("f1", "The Stain spreads"), part: "force" as const, knowledge: null });
    const loreRow = () => canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall" });
    const entryPane = "[data-testid=canon-chapter-entry]";

    it("renders a selected lore entry, force and secret in the chapter's entry, and no side column", async () => {
      data.value = [loreRow(), forceRow(), { ...truth("s1", "Sift"), part: "secret", knowledge: null }];
      for (const [part, id, detail] of [["lore", "l1", "lore-detail"], ["moving", "f1", "force-detail"], ["secrets", "s1", "secret-detail"]] as const) {
        route.params = { part };
        route.query = { entry: id };
        const w = mountView();
        await settle();
        expect(w.find(`${entryPane} [data-testid=${detail}]`).exists()).toBe(true);
        expect(w.find("aside").exists()).toBe(false);
        expect(w.find("#canon-inline-detail").exists()).toBe(true);
      }
    });

    it("keeps a selected truth's entry in the Truths chapter, and shows it once", async () => {
      route.query = { entry: "t1" };
      const w = mountView();
      await settle();
      expect(w.findAll("[data-testid=detail]")).toHaveLength(1);
      expect(w.findComponent({ name: "TruthsChapter" }).props("selected")).toMatchObject({ id: "t1" });
    });

    // Bug caught: the chapter told it is open when only another chapter's entry is, so its list hid behind nothing.
    it("opens the chapter only for an entry of its own part", async () => {
      data.value = [loreRow()];
      route.params = { part: "moving" };
      route.query = {};
      const w = mountView();
      await settle();
      expect(w.find("[data-chapter=moving]").attributes("data-open")).toBeUndefined();
      route.params = { part: "lore" };
      route.query = { entry: "l1" };
      await settle();
      expect(w.find("[data-chapter=lore]").attributes("data-open")).toBeDefined();
    });

    // Bug caught: the close button did nothing, or cleared only ?backstory so a backstory opened by ?entry stayed open.
    it("closes an open lore entry by clearing ?entry", async () => {
      data.value = [loreRow()];
      route.params = { part: "lore" };
      route.query = { entry: "l1" };
      const w = mountView();
      await settle();
      await w.find("[data-testid=canon-chapter-back]").trigger("click");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined, backstory: undefined } });
    });

    it("closes an open backstory by clearing ?backstory", async () => {
      route.params = { part: "backstories" };
      route.query = { backstory: "m2" };
      const w = mountView();
      await settle();
      await w.find("[data-testid=canon-chapter-back]").trigger("click");
      expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: undefined, backstory: undefined } });
    });

    // Bug caught: a deep link to a lore entry (the old `/canon?entry=<id>`, which every link in the app still makes) landed
    // on the part the DM was last on, or on the contents' first part, with the entry nowhere on screen.
    it("takes a bare /canon?entry=<lore id> to /canon/lore with the entry selected", async () => {
      data.value = [loreRow()];
      route.params = {};
      route.query = { entry: "l1" };
      const w = mountView();
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
      expect(mocks.replace).toHaveBeenCalledWith({ path: "/canon/lore", query: { entry: "l1", section: undefined } });
      expect(w.find("[data-testid=lore-detail]").text()).toBe("The Fall");
    });

    // Bug caught: /canon/truths?entry=<lore id> drew the lore's detail under the Truths part.
    // Bug caught: the scroll to the entry's row spent while its part was not on screen yet, so the entry opened out of sight.
    it("moves an entry link whose part is not the one in the address to the entry's own part, and scrolls to its row there", async () => {
      data.value = [loreRow()];
      // The row exists only once the Lore part is on screen, as in the app.
      const loreRows = { name: "LoreSection", props: ["lore"], template: "<section><i id='canon-entry-l1' /></section>" };
      route.params = { part: "truths" };
      route.query = { entry: "l1" };
      const w = mountView({ LoreSection: loreRows });
      await settle();
      expect(route.params.part).toBe("lore");
      expect(w.findComponent({ name: "TruthsChapter" }).exists()).toBe(false);
      expect(mocks.scroll.mock.calls[0]?.[0]).toBe(document.getElementById("canon-entry-l1"));
    });

    // Bug caught: the split's detail lost the id the tap-scroll looks for, so on a phone a tapped lore row opened off screen.
    it("scrolls a tapped lore row's entry into view, at any width", async () => {
      data.value = [loreRow()];
      route.params = { part: "lore" };
      const loreStub = { name: "LoreSection", props: ["lore"], emits: ["select"], template: "<section><i id='tap-lore' @click=\"$emit('select', 'l1')\" /></section>" };
      const w = mount(CanonView, {
        attachTo: document.body,
        global: { stubs: { ...STUBS, LoreSection: loreStub } },
      });
      mounted.push(w);
      await w.find("#tap-lore").trigger("click");
      route.query = { entry: "l1" };
      await settle();
      expect(mocks.scroll.mock.calls.at(-1)?.[0]).toBe(document.getElementById("canon-inline-detail"));
    });
  });

  it("opens the lore entry named by ?entry=<id> with the lore detail, so a link from a passage lands on its entry", async () => {
    data.value = [canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall of the Bakers' Guild" })];
    route.params = { part: "lore" };
    route.query = { entry: "l1" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=lore-detail]").text()).toBe("The Fall of the Bakers' Guild");
  });

  it("asks with the lore's own wording, naming its passages, when the open entry is lore", async () => {
    data.value = [canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall" })];
    route.params = { part: "lore" };
    route.query = { entry: "l1" };
    mocks.confirm.mockResolvedValue(false);
    const w = mountView();
    await settle();
    await w.find("[data-testid=del-lore]").trigger("click");
    expect(mocks.confirm.mock.calls[0]![0]).toContain("passages");
  });

  // Bug caught: a character with no backstory entry yet could not be opened, since the page only knew entries, so the
  // DM could not start one from the list of characters.
  it("opens a character's backstory from ?backstory=<party member>, before any entry exists for it", async () => {
    route.params = { part: "backstories" };
    route.query = { backstory: "m2" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=backstory-detail]").text()).toBe("Pim");
  });

  // Bug caught: Ask Grimoire's "Review suggestions" landed on the top of the Canon page, with the suggested truths
  // somewhere far down it, so the DM saw nothing had happened. Its link is `/canon?section=<helper's word>`.
  it("resolves ?section= to its part, by the part's id or the word a helper uses, and ignores a part that does not exist", async () => {
    route.params = {};
    route.query = { section: "lore" };
    const w = mountView();
    await settle();
    expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
    expect(mocks.replace).toHaveBeenCalledWith({ path: "/canon/lore", query: { section: undefined } });
    expect(route.query.section).toBeUndefined();
    w.unmount();
    mounted.pop();

    route.params = {};
    route.query = { section: "forces" }; // the helper says forces, the contents call the part "moving"
    const forces = mountView();
    await settle();
    expect(forces.findComponent({ name: "CanonContents" }).props("active")).toBe("moving");
    forces.unmount();
    mounted.pop();

    localStorage.clear();
    setActivePinia(createPinia());
    route.params = {};
    route.query = { section: "not-a-part" };
    const none = mountView();
    await settle();
    expect(none.findComponent({ name: "CanonContents" }).props("active")).toBe("premise");
  });

  // Bug caught: a search result or web link to a backstory entry opened nothing.
  it("opens the character a backstory entry belongs to from ?entry=<entry id>", async () => {
    data.value = [canonEntry({ id: "b1", campaign_id: "c1", part: "backstory", party_member_id: "m1", title: "" })];
    route.params = { part: "backstories" };
    route.query = { entry: "b1" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=backstory-detail]").text()).toBe("Tansy");
  });

  it("opens nothing for a backstory of a character who is not in the party", async () => {
    route.params = { part: "backstories" };
    route.query = { backstory: "gone" };
    const w = mountView();
    await settle();
    expect(w.find("[data-testid=backstory-detail]").exists()).toBe(false);
  });

  it("opens nothing without ?entry", async () => {
    expect(mountView().find("[data-testid=detail]").exists()).toBe(false);
  });

  it("puts a clicked truth in the URL, keeping the other query it carries", async () => {
    route.query = { backstory: "m1" };
    const w = mountView();
    await w.find("#canon-entry-t1").trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { entry: "t1", backstory: undefined } });
  });

  describe("deleting the open truth", () => {
    async function openAndDelete() {
      route.query = { entry: "t1" };
      const w = mountView();
      await settle();
      await w.find("[data-testid=del]").trigger("click");
      await settle();
    }

    it("asks with the secret's own wording, naming its clues, when the open entry is a secret", async () => {
      data.value = [{ ...truth("s1", "Sift is the guild master's daughter."), part: "secret", knowledge: null }];
      route.params = { part: "secrets" };
      route.query = { entry: "s1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await settle();
      await w.find("[data-testid=del-secret]").trigger("click");
      expect(mocks.confirm.mock.calls[0][0]).toContain("Delete this secret?");
      expect(mocks.confirm.mock.calls[0][0]).toContain("clues");
    });

    it("asks with the force's own wording, naming its steps, ticks and quest links, when the open entry is a force", async () => {
      data.value = [{ ...truth("f1", "The Stain spreads"), part: "force", knowledge: null }];
      route.params = { part: "moving" };
      route.query = { entry: "f1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await settle();
      await w.find("[data-testid=del-force]").trigger("click");
      expect(mocks.confirm.mock.calls[0][0]).toContain("Delete this force?");
      expect(mocks.confirm.mock.calls[0][0]).toContain("steps, ticks and quest links");
    });

    // Bug caught (#1258 item 32): the lore delete asked "Delete this lore?", a noun that is not what the DM sees (a lore entry).
    it("asks with the lore entry's own wording, naming its passages", async () => {
      data.value = [{ ...truth("l1", "The founding"), part: "lore", knowledge: null }];
      route.params = { part: "lore" };
      route.query = { entry: "l1" };
      mocks.confirm.mockResolvedValue(false);
      const w = mountView();
      await settle();
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
  it("offers Bring in a book in the header and under the title on a phone, leading to the import page", () => {
    const w = mountView();
    expect(w.findAll("a[href='/canon/import']")).toHaveLength(2);
    expect(w.find("[data-testid=canon-phone-actions] a[href='/canon/import']").exists()).toBe(true);
  });

  // Bug caught (#1258 item 20): the search and Bring in a book sat at the very bottom of the page on a phone, past every chapter.
  it("puts the phone actions under the title, before the contents and every chapter, and only on a phone", () => {
    const w = mountView();
    const actions = w.get("[data-testid=canon-phone-actions]");
    expect(actions.classes()).toContain("md:hidden");
    expect(actions.find("input[type=search]").exists()).toBe(true);
    const html = w.html();
    expect(html.indexOf("canon-phone-actions")).toBeLessThan(html.indexOf("canon-contents-stub"));
  });

  // Bug caught: the Canon keeping an AI panel of its own, or the Tonight shortcut, after the Familiar took over.
  it("holds no AI tools and no Tonight button of its own", () => {
    const w = mountView();
    expect(w.findComponent({ name: "CanonAiTools" }).exists()).toBe(false);
    expect(w.find("a[href='/canon/tonight']").exists()).toBe(false);
  });

  // Bug caught: the contents still counting the Chronicle or the table's lines, which are no longer chapters.
  it("hands the contents only its chapters' counts", () => {
    const counts = mountView().findComponent({ name: "CanonContents" }).props("counts") as Record<string, number>;
    expect(Object.keys(counts).sort()).toEqual(["backstories", "life", "lore", "moving", "peoples", "premise", "secrets", "truths", "world"]);
  });

  // Bug caught: the contents column counting only the backstories already opened, so a party of two read "0" over a ledger of two rows.
  it("counts one backstory per character, opened or not", () => {
    const counts = mountView().findComponent({ name: "CanonContents" }).props("counts") as Record<string, number>;
    expect(counts.backstories).toBe(2);
  });

  // Bug caught: Peoples and Life drawn with no heading (they are not list chapters), so the page did not say where the DM was.
  it("draws Peoples and Life under their own heading and reason", async () => {
    route.params = { part: "peoples" };
    const w = mountView();
    await settle();
    expect(w.find("[data-chapter=peoples] h2").text()).toBe("Peoples");
    expect(w.findComponent({ name: "WorldPeoples" }).exists()).toBe(true);
    route.params = { part: "life" };
    await settle();
    expect(w.find("[data-chapter=life] h2").text()).toBe("Life");
    expect(w.findComponent({ name: "HabitatsPanel" }).exists()).toBe(true);
    expect(w.findComponent({ name: "WorldPeoples" }).exists()).toBe(false);
  });

  // Bug caught: a search hit on an open question or a premise entry opened the page with nothing scrolled to or marked,
  // because the page only resolved truth, force, secret and lore.
  describe("landing on an entry with no detail pane", () => {
    const rowStub = { props: ["entries", "questions"], template: "<section><i v-for='e in (entries ?? questions)' :id=\"'canon-entry-' + e.id\" :key='e.id' /></section>" };
    function mountLanding() {
      const w = mount(CanonView, {
        attachTo: document.body,
        global: { stubs: { ...STUBS, PremiseSection: rowStub, SecretsSection: rowStub, TruthsChapter: true } },
      });
      mounted.push(w);
      return w;
    }

    // Bug caught (#1255 item 14): a link to "What the table added" landed on the part the DM was last on, because nothing
    // read which part a link meant; and, since the table's lines moved to Truths, an old link to a chapter that is gone.
    it("opens at the chapter named by ?section (the old table link lands on Truths), and keeps the one it was on for one that does not exist", async () => {
      route.params = {};
      route.query = { section: "table" };
      const w = mountLanding();
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("truths");
      expect(route.params.part).toBe("truths");

      route.params = { part: "lore" };
      route.query = { section: "nowhere" };
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
    });

    it("sets Secrets active and scrolls to the open question named by ?entry", async () => {
      data.value = [canonEntry({ id: "q1", campaign_id: "c1", part: "question", title: "Who burned the mill?" })];
      route.params = {};
      route.query = { entry: "q1" };
      const w = mountLanding();
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("secrets");
      expect(mocks.scroll).toHaveBeenCalledTimes(1);
      expect(mocks.scroll.mock.calls[0]?.[0]).toBe(document.getElementById("canon-entry-q1"));
    });

    it("sets Premise active, scrolls to a theme entry and marks it for a moment", async () => {
      vi.useFakeTimers();
      try {
        data.value = [canonEntry({ id: "p1", campaign_id: "c1", part: "premise", premise_kind: "theme", title: "Dread" })];
        route.params = {};
        route.query = { entry: "p1" };
        const w = mountLanding();
        await settle();
        const row = document.getElementById("canon-entry-p1")!;
        expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("premise");
        expect(mocks.scroll.mock.calls[0]?.[0]).toBe(row);
        expect(row.classList.contains("ring-primary")).toBe(true);
        vi.advanceTimersByTime(2500);
        expect(row.classList.contains("ring-primary")).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Bug caught: a tapped row opening its entry off screen (beside the list it is in sight; in place of it, it is the whole chapter), with nothing bringing it into view.
  it("scrolls the opened entry into view after a tap, and never to the row the DM already touched", async () => {
    const w = mountView();
    await w.find("#canon-entry-t1").trigger("click");
    route.query = { entry: "t1" };
    await settle();
    expect(mocks.scroll).toHaveBeenCalledTimes(1);
    expect(mocks.scroll.mock.calls[0]?.[0]).toBe(document.getElementById("canon-inline-detail"));
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
      await settle();
      expect(w.findComponent({ name: "TruthsChapter" }).props("truths").map((t: CanonEntry) => t.id)).toEqual(["t1"]);
      route.params = { part: "premise" };
      await settle();
      expect(w.findComponent({ name: "PremiseSection" }).props("entries").map((t: CanonEntry) => t.id)).toContain("p1");
    });

    // Bug caught (#1258 item 29): the arc hiding a character whose backstory is in another arc, or who has none yet. A
    // character spans arcs, so the Backstories part lists the whole party under any arc.
    it("lists every character under an arc, whatever arc their backstory is in", async () => {
      party.value = [...party.value, { id: "m3", name: "Wren" }];
      route.params = { part: "backstories" };
      const w = mountView();
      await settle();
      expect(w.findComponent({ name: "BackstoriesSection" }).props("party").map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3"]);
      party.value = party.value.slice(0, 2);
    });

    it("counts the contents by what the arc shows", async () => {
      route.params = { part: "premise" };
      const w = mountView();
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("counts")).toMatchObject({ truths: 1, premise: 1, backstories: 2 });
    });

    it("keeps a truth open when the DM moves it to another arc, instead of closing it under them", async () => {
      route.query = { entry: "t2" };
      const w = mountView();
      await settle();
      expect(w.find("[data-testid=detail]").text()).toBe("The Stain is a wound.");
    });
  });

  // #1258 item 19: one part per view.
  describe("one part at a time", () => {
    const names = (w: ReturnType<typeof mountView>) => ["PremiseSection", "TruthsChapter", "ForcesSection", "SecretsSection", "LoreSection", "BackstoriesSection"].filter((n) => w.findComponent({ name: n }).exists());

    // Bug caught: the page still stacking every part (the old long scroll) behind a contents column that only highlights one.
    it("renders only the part in the address", async () => {
      const w = mountView();
      await settle();
      expect(names(w)).toEqual(["TruthsChapter"]);
      route.params = { part: "lore" };
      await settle();
      expect(names(w)).toEqual(["LoreSection"]);
    });

    // Bug caught: a bare /canon opening on Premise every time, or on nothing, instead of where the DM left off.
    it("opens /canon on the part the DM was last on, and on Premise the first time", async () => {
      route.params = {};
      const first = mountView();
      await settle();
      expect(first.findComponent({ name: "CanonContents" }).props("active")).toBe("premise");
      first.unmount();
      mounted.pop();

      localStorage.setItem("grimoire:canon-part", "lore");
      setActivePinia(createPinia());
      route.params = {};
      const again = mountView();
      await settle();
      expect(again.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
      expect(mocks.replace).toHaveBeenLastCalledWith({ path: "/canon/lore", query: { section: undefined } });
    });

    // Bug caught: the page redirecting before the canon has loaded (an entry link's part is not known yet), or highlighting
    // Premise while it loads, when the DM was last on Lore.
    it("highlights the remembered part while the canon loads, and rewrites the address only once it has", async () => {
      localStorage.setItem("grimoire:canon-part", "lore");
      setActivePinia(createPinia());
      route.params = {};
      loading.value = true;
      const w = mountView();
      await settle();
      expect(w.findComponent({ name: "CanonContents" }).props("active")).toBe("lore");
      expect(mocks.replace).not.toHaveBeenCalled();
      loading.value = false;
      await settle();
      expect(mocks.replace).toHaveBeenCalledWith({ path: "/canon/lore", query: { section: undefined } });
    });

    // Bug caught: choosing a part in the contents changing the highlight but not the address, so reload or back lost it.
    it("goes to the part chosen in the contents, remembers it, and leaves the open entry behind", async () => {
      route.query = { entry: "t1" };
      const w = mountView();
      await settle();
      w.findComponent({ name: "CanonContents" }).vm.$emit("select", "lore");
      await settle();
      expect(mocks.push).toHaveBeenCalledWith({ path: "/canon/lore" });
      expect(route.query.entry).toBeUndefined();
      expect(useCanonUiStore().lastPart).toBe("lore");
      expect(names(w)).toEqual(["LoreSection"]);
      // A part opens at its top (the search row), since no entry is asked for.
      expect(mocks.scroll.mock.calls.at(-1)?.[0]).toBe(document.getElementById("canon-page-top"));
    });

    // Bug caught: following a link to an entry in another part scrolling to the top of the page instead of to the entry's row.
    it("scrolls to the entry's row, not the top of the page, when a link brings the DM to another part", async () => {
      data.value = [...data.value, canonEntry({ id: "l1", campaign_id: "c1", part: "lore", title: "The Fall" })];
      const w = mountView();
      await settle();
      mocks.scroll.mockClear();
      route.params = { part: "lore" };
      route.query = { entry: "l1" };
      await settle();
      expect(mocks.scroll.mock.contexts).not.toContain(document.getElementById("canon-page-top"));
      expect(w.findComponent({ name: "LoreSection" }).exists()).toBe(true);
    });

    // Bug caught: the arc bar drawn over the skeleton, offering a filter for a canon that has not loaded.
    it("shows no arc bar while the canon loads", async () => {
      loading.value = true;
      const w = mountView();
      await settle();
      expect(w.findComponent({ name: "CanonArcs" }).exists()).toBe(false);
    });

    // Bug caught: the arc bar missing from a part an arc narrows (no way to clear the arc), or shown over the premise, which no arc narrows.
    it("keeps the arc bar above the parts an arc narrows, and not over the rest", async () => {
      const w = mountView();
      await settle();
      const hasArcs = () => w.findComponent({ name: "CanonArcs" }).exists();
      expect(hasArcs()).toBe(true);
      route.params = { part: "premise" };
      await settle();
      expect(hasArcs()).toBe(false);
      route.params = { part: "secrets" };
      await settle();
      expect(hasArcs()).toBe(true);
    });
  });

  // #1258 item 21: one search for the whole page.
  describe("the page's search", () => {
    const tiptap = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    beforeEach(() => {
      data.value = [
        truth("t1", "The river gives back."),
        canonEntry({ id: "s1", campaign_id: "c1", part: "secret", title: "The mill burned on purpose", body: tiptap("The miller paid for the fire.") }),
        canonEntry({ id: "f1", campaign_id: "c1", part: "force", title: "The Stain spreads" }),
      ];
      clues.value = [{ id: "c-1", secret_id: "s1", title: "A tin of lamp oil in the miller's cellar" }];
      forceData.value = { steps: [{ id: "st-1", force_id: "f1", title: "The ferry stops running" }] };
    });
    const links = (w: ReturnType<typeof mountView>) => w.findAll("[data-testid=result-link]").map((a) => a.attributes("href"));

    // Bug caught: the search matching titles only, so "miller" (in a body and a clue) found nothing.
    it("finds a word in a body, a clue title and a force step, grouped by part, each linking to its entry", async () => {
      const w = mountView();
      useCanonUiStore().query = "miller";
      await settle();
      expect(w.find("[data-testid=results-secrets]").exists()).toBe(true);
      expect(w.find("[data-testid=results-truths]").exists()).toBe(false);
      expect(links(w)).toEqual(["/canon/secrets?entry=s1", "/canon/secrets?entry=s1"]);
      useCanonUiStore().query = "ferry";
      await settle();
      expect(links(w)).toEqual(["/canon/moving?entry=f1"]);
    });

    // Bug caught: the results drawn under the part instead of in its place, two lists answering one question.
    it("shows the results in place of the part while a query is set, and the part again once it is cleared", async () => {
      const w = mountView();
      useCanonUiStore().query = "river";
      await settle();
      expect(w.findComponent({ name: "TruthsChapter" }).exists()).toBe(false);
      expect(w.find("[data-testid=canon-search-results]").exists()).toBe(true);
      await w.find("[data-testid=search-clear]").trigger("click");
      expect(useCanonUiStore().query).toBe("");
      expect(w.findComponent({ name: "TruthsChapter" }).exists()).toBe(true);
    });

    // Bug caught: following a result with the query still set, so the entry opened behind the very list that was clicked.
    it("clears the query when a result is followed, and when a part is chosen in the contents", async () => {
      const w = mountView();
      const ui = useCanonUiStore();
      ui.query = "river";
      await settle();
      await w.find("[data-testid=result-link]").trigger("click");
      expect(ui.query).toBe("");
      ui.query = "river";
      w.findComponent({ name: "CanonContents" }).vm.$emit("select", "lore");
      expect(ui.query).toBe("");
    });

    // Bug caught: the open truth staying beside the results, so a detail the DM did not ask for sits next to the list.
    it("closes the open entry while the results are shown", async () => {
      route.query = { entry: "t1" };
      const w = mountView();
      await settle();
      expect(w.find("[data-testid=detail]").exists()).toBe(true);
      useCanonUiStore().query = "river";
      await settle();
      expect(w.find("[data-testid=detail]").exists()).toBe(false);
    });

    // Bug caught: an arc's other entries still turning up under the arc filter.
    it("searches only what the arc leaves in", async () => {
      data.value = [{ ...truth("t1", "The river gives back."), arc_id: "a1" }, truth("t2", "The river is a wound.")];
      useCanonUiStore().arcFilter = "a1";
      const w = mountView();
      useCanonUiStore().query = "river";
      await settle();
      expect(links(w)).toEqual(["/canon/truths?entry=t1"]);
    });
  });
});
