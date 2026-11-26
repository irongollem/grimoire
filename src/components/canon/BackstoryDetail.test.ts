import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), createEntry: vi.fn(), connect: vi.fn(), remove: vi.fn(), toastError: vi.fn() }));
const state = vi.hoisted(() => ({ entry: null as unknown, passages: [] as unknown[], sessions: [] as unknown[] }));
const threadData = vi.hoisted(() => ({ entries: [] as unknown[], links: [] as unknown[] }));
vi.mock("@/composables/connections/useConnections", () => ({
  useCampaignLinks: () => ({ data: computed(() => threadData.links) }),
  useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.connect }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: Error) => e.message } }));
vi.mock("@/composables/canon/useEntryQuestLinks", () => ({ useEntryQuestLinks: () => ref([]) }));
vi.mock("@/composables/canon/useBackstory", () => ({ useBackstoryEntry: () => ({ entry: computed(() => state.entry), opening: ref(false) }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }),
  useTrashCanonEntry: () => ({ mutateAsync: mocks.remove, mutate: mocks.remove }),
  useCanonEntries: () => ({ data: computed(() => threadData.entries) }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: true }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewMode: false }) }));
vi.mock("@/composables/canon/usePassageList", () => ({
  usePassageList: () => ({ passages: computed(() => state.passages), adding: ref(false), addPassage: vi.fn(), move: vi.fn(), removePassage: vi.fn() }),
}));
vi.mock("@/composables/canon/useNewBackstoryNpc", () => ({ useNewBackstoryNpc: () => ({ start: vi.fn(), creating: ref(false), discardPending: vi.fn() }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: computed(() => state.sessions) }) }));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import BackstoryDetail from "./BackstoryDetail.vue";

const member = { id: "m1", name: "Tansy", player_name: "Lotte", owner_user_id: "lotte", player_description: null } as unknown as PartyMember;
const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({
  id: "g", user_id: "dm", campaign_id: "c1", entry_id: "b1", title: "t", body: null, sort_order: 0, player_visible_to: [], told_at: null, told_session_id: null,
  location_id: null, npc_id: null, quest_beat_id: null, author_id: "dm", dm_edited_at: null, body_before_dm_edit: null, ai_provenance: null, created_at: "2026-10-10T09:00:00Z", updated_at: "", ...over,
});

const RowStub = {
  name: "LorePassageRow",
  props: ["passage", "byline", "playersOwn", "tellTarget", "first"],
  template: "<li data-testid='row' :data-byline='byline' :data-players='playersOwn' :data-target='tellTarget && tellTarget.name' :data-first='first' />",
};
const SectionStub = { name: "ConnectionsSection", props: ["subject", "subjectName", "title"], template: "<div data-testid='section' :data-kind='subject.kind' :data-id='subject.id' />" };
const EntryStoryLinksStub = { name: "EntryStoryLinks", props: ["entry"], template: "<div data-testid='story-links' :data-entry='entry.id' />" };
const mountDetail = () =>
  mount(BackstoryDetail, {
    props: { member },
    global: { stubs: { LorePassageRow: RowStub, BackstoryBeforePlay: true, ConnectionsSection: SectionStub, AudienceRevealControl: true, CanonSuggest: true, ListSkeleton: true, EntryQuests: true, EntryStoryLinks: EntryStoryLinksStub, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } },
  });

describe("BackstoryDetail", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    state.entry = canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" });
    state.passages = [];
    state.sessions = [{ number: 15, started_at: "2026-10-08T18:00:00Z" }];
    threadData.entries = [];
    threadData.links = [];
  });

  // Bug caught: Tell on a backstory passage reaching the whole party before the character it is about.
  it("offers every passage to be told to this character, and never treats the first as told with the entry", () => {
    state.passages = [passage({ id: "a", author_id: "dm" })];
    const row = mountDetail().find("[data-testid=row]");
    expect(row.attributes("data-target")).toBe("Tansy");
    expect(row.attributes("data-first")).toBe("false");
  });

  // Bug caught: the people and passages drawn (and New NPC offered) for an entry that did not exist yet.
  it("offers nothing to write into until the backstory entry exists", () => {
    state.entry = null;
    const w = mountDetail();
    expect(w.find("[data-testid=new-npc]").exists()).toBe(false);
    expect(w.find("[data-testid=backstory-passages]").exists()).toBe(false);
  });

  // Bug caught (#1279 item 12): a second Connections block whose subject is the backstory entry, so a hometown tied here
  // was not the character's tie and never showed on the character's page (and the people were listed in a third copy).
  it("mounts exactly one Connections block, on the character, and no list of people of its own", () => {
    const w = mountDetail();
    expect(w.findAll("[data-testid=section]").map((s) => `${s.attributes("data-kind")}:${s.attributes("data-id")}`)).toEqual(["party_member:m1"]);
    expect(w.find("[data-testid=backstory-people-list]").exists()).toBe(false);
  });

  // Bug caught: the block waiting on the backstory entry, so a character whose entry is not made yet cannot be tied.
  it("mounts the character's block before the entry exists", () => {
    state.entry = null;
    expect(mountDetail().find("[data-testid=section]").attributes("data-id")).toBe("m1");
  });

  // Bug caught (#1258 item 18): cause and effect listed twice, in the story links and again as raw rows.
  it("mounts the story links for the entry", () => {
    expect(mountDetail().get("[data-testid=story-links]").attributes("data-entry")).toBe("b1");
  });

  describe("threads left open", () => {
    const thread = (to_id: string) => ({ from_kind: "canon", from_id: "b1", to_kind: "canon", to_id, type: "related_to" });

    // Bug caught: an answered question (or a revealed secret) still listed as a thread the past leaves open.
    it("lists the open questions and unrevealed secrets tied to the backstory, not an answered one", () => {
      threadData.entries = [
        canonEntry({ id: "q1", part: "question", title: "Who burned the mill?" }),
        canonEntry({ id: "q2", part: "question", title: "Settled", closed_as: "answered", closed_at: "2026-11-01T00:00:00Z", closed_note: "Maren" }),
        canonEntry({ id: "s1", part: "secret", title: "Who paid" }),
      ];
      threadData.links = [thread("q1"), thread("q2"), thread("s1")];
      expect(mountDetail().findAll("[data-testid=backstory-thread]").map((t) => t.text())).toEqual(["Who burned the mill?a question", "Who paida secret"]);
    });

    // Bug caught (#1258 item 5): a question answered or a secret revealed dropping out of the backstory with nothing kept.
    it("keeps an answered thread under a collapsed 'Paid off (n)', with what it became and when", async () => {
      state.sessions = [{ number: 15, started_at: "2026-10-08T18:00:00Z" }];
      threadData.entries = [
        canonEntry({ id: "q2", part: "question", title: "Who burned the mill?", closed_as: "answered", closed_at: "2026-11-01T00:00:00Z", closed_note: "Maren did", became_entry_id: "t9" }),
        canonEntry({ id: "t9", part: "truth", title: "Maren burned the mill" }),
      ];
      threadData.links = [thread("q2")];
      const w = mountDetail();
      expect(w.find("[data-testid=backstory-thread]").exists()).toBe(false);
      expect(w.find("[data-testid=paid-off-toggle]").text()).toBe("Paid off (1)");
      expect(w.find("[data-testid=paid-off-list]").exists()).toBe(false);
      await w.find("[data-testid=paid-off-toggle]").trigger("click");
      expect(w.find("[data-testid=paid-off-thread]").text()).toContain("Who burned the mill?");
      expect(w.find("[data-testid=paid-off-became]").text()).toBe('became "Maren burned the mill", after session 15');
    });

    async function addThread(w: ReturnType<typeof mountDetail>, words: string) {
      await w.get("input[aria-label='A thread this past leaves open']").setValue(words);
      await w.get("[data-testid=backstory-threads] form").trigger("submit");
      await flushPromises();
    }

    // Bug caught: the tie written before the question exists (no id to tie to), or to the wrong end, or as a world tie other than related_to.
    it("makes an open question, then ties it to the backstory", async () => {
      const order: string[] = [];
      mocks.createEntry.mockImplementation(async () => { order.push("question"); return { id: "q9", title: "Who burned the mill?" }; });
      mocks.connect.mockImplementation(async () => { order.push("tie"); });
      await addThread(mountDetail(), "Who burned the mill?");
      expect(mocks.createEntry).toHaveBeenCalledWith({ part: "question", title: "Who burned the mill?", arc_id: null });
      expect(mocks.connect).toHaveBeenCalledWith({
        input: expect.objectContaining({ subject: { kind: "canon", id: "b1" }, other: { kind: "canon", id: "q9", name: "Who burned the mill?" }, choice: expect.objectContaining({ key: "related_to" }) }),
        campaignId: "c1",
      });
      expect(order).toEqual(["question", "tie"]);
    });

    // Bug caught: a failed tie deleting the question (losing the DM's words) or failing without a word.
    it("keeps the question and says so when the tie fails", async () => {
      mocks.createEntry.mockResolvedValue({ id: "q9", title: "Who burned the mill?" });
      mocks.connect.mockRejectedValue(new Error("refused"));
      await addThread(mountDetail(), "Who burned the mill?");
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("could not be tied"));
    });
  });
});
