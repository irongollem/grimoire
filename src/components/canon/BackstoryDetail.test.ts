import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ startNpc: vi.fn(), update: vi.fn(), createEntry: vi.fn(), connect: vi.fn(), remove: vi.fn(), toastError: vi.fn() }));
const state = vi.hoisted(() => ({ entry: null as unknown, passages: [] as unknown[], sessions: [] as unknown[] }));
const ties = vi.hoisted(() => ({ byKind: {} as Record<string, unknown[]> }));
const threadData = vi.hoisted(() => ({ entries: [] as unknown[], links: [] as unknown[] }));
vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: (kind: string) => ({ data: computed(() => ties.byKind[kind] ?? []) }),
  useCampaignLinks: () => ({ data: computed(() => threadData.links) }),
  useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.connect }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: Error) => e.message } }));
vi.mock("@/composables/canon/useEntryQuestLinks", () => ({ useEntryQuestLinks: () => ref([]) }));
vi.mock("@/composables/canon/useBackstory", () => ({ useBackstoryEntry: () => ({ entry: computed(() => state.entry), opening: ref(false) }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }),
  useDeleteCanonEntry: () => ({ mutateAsync: mocks.remove, mutate: mocks.remove }),
  useCanonEntries: () => ({ data: computed(() => threadData.entries) }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: true }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewMode: false }) }));
vi.mock("@/composables/canon/usePassageList", () => ({
  usePassageList: () => ({ passages: computed(() => state.passages), adding: ref(false), addPassage: vi.fn(), move: vi.fn(), removePassage: vi.fn() }),
}));
vi.mock("@/composables/canon/useNewBackstoryNpc", () => ({ useNewBackstoryNpc: () => ({ start: mocks.startNpc, creating: ref(false) }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: computed(() => state.sessions) }) }));

import type { Connection } from "@/types/connections.types";
import BackstoryDetail from "./BackstoryDetail.vue";

const member = { id: "m1", name: "Tansy", player_name: "Lotte", owner_user_id: "lotte", player_description: null } as unknown as PartyMember;
const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({
  id: "g", user_id: "dm", campaign_id: "c1", entry_id: "b1", title: "t", body: null, sort_order: 0, player_visible_to: [], told_at: null, told_session_id: null,
  location_id: null, npc_id: null, quest_beat_id: null, author_id: "dm", ai_provenance: null, created_at: "2026-10-10T09:00:00Z", updated_at: "", ...over,
});

const RowStub = {
  name: "LorePassageRow",
  props: ["passage", "byline", "playersOwn", "tellTarget", "first"],
  template: "<li data-testid='row' :data-byline='byline' :data-players='playersOwn' :data-target='tellTarget && tellTarget.name' :data-first='first' />",
};
// Draws what the real block would: the rows of its subject's kind, less any `hide` drops, and the marked ones.
const SectionStub = {
  name: "ConnectionsSection",
  props: ["subject", "subjectName", "title", "origin", "hide"],
  template: `<div data-testid='section' :data-kind='subject.kind' :data-id='subject.id'>
    <span v-for='c in rows' :key='c.row_id' data-testid='tie' :data-marked='origin && origin.npcIds.has(c.other_id)'>{{ c.other_id }}</span></div>`,
  computed: {
    rows(this: { subject: { kind: string }; hide?: (c: Connection) => boolean }) {
      return (ties.byKind[this.subject.kind] as Connection[] ?? []).filter((c) => !this.hide?.(c));
    },
  },
};
const tie = (over: Partial<Connection>) => ({ row_id: "r", type: "about", other_kind: "npc", other_id: "n1", ...over }) as Connection;
const mountDetail = () =>
  mount(BackstoryDetail, {
    props: { member },
    global: { stubs: { LorePassageRow: RowStub, BackstoryBeforePlay: true, ConnectionsSection: SectionStub, AudienceRevealControl: true, ListSkeleton: true, EntryQuests: true, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } },
  });

describe("BackstoryDetail", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    state.entry = canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" });
    state.passages = [];
    ties.byKind = {};
    state.sessions = [{ number: 15, started_at: "2026-10-08T18:00:00Z" }];
    threadData.entries = [];
    threadData.links = [];
  });

  // Bug caught: the DM could not tell their own passage from the player's, or which session the player wrote one after.
  it("marks the player's passages with who and when, and the DM's as 'Your passage'", () => {
    state.passages = [passage({ id: "a", author_id: "lotte" }), passage({ id: "b", author_id: "dm" })];
    const rows = mountDetail().findAll("[data-testid=row]");
    expect(rows.map((r) => r.attributes("data-byline"))).toEqual(["Written by Lotte · after session 15", "Your passage"]);
    expect(rows.map((r) => r.attributes("data-players"))).toEqual(["true", "false"]);
  });

  // Bug caught: Tell on a backstory passage reaching the whole party before the character it is about.
  it("offers every passage to be told to this character, and never treats the first as told with the entry", () => {
    state.passages = [passage({ id: "a", author_id: "dm" })];
    const row = mountDetail().find("[data-testid=row]");
    expect(row.attributes("data-target")).toBe("Tansy");
    expect(row.attributes("data-first")).toBe("false");
  });

  it("counts the passages and how many are not yet told", () => {
    state.passages = [passage({ id: "a", told_at: "2026-10-10T09:00:00Z" }), passage({ id: "b" }), passage({ id: "c" })];
    expect(mountDetail().find("[data-testid=backstory-tally]").text()).toBe("3 passages, 2 not yet told");
  });

  it("creates the person from this backstory after choosing their relationship to the character", async () => {
    const w = mountDetail();
    await w.find("[data-testid=new-npc]").trigger("click");
    await w.findAll("button").find((button) => button.text() === "friend of")!.trigger("click");
    await w.find("[data-testid=create-npc]").trigger("click");
    expect(mocks.startNpc).toHaveBeenCalledWith("b1", "Tansy", "m1", expect.objectContaining({ key: "friend" }));
  });

  // Bug caught: the people and passages drawn (and New NPC offered) for an entry that did not exist yet.
  it("offers nothing to write into until the backstory entry exists", () => {
    state.entry = null;
    const w = mountDetail();
    expect(w.find("[data-testid=new-npc]").exists()).toBe(false);
    expect(w.find("[data-testid=backstory-passages]").exists()).toBe(false);
  });

  // Bug caught: the people block was mounted on the canon entry, so it showed only the `about` ties and never the
  // relationships the character's page shows.
  it("mounts the people block on the character, and the places block on the entry", () => {
    const sections = mountDetail().findAll("[data-testid=section]");
    expect(sections.map((s) => `${s.attributes("data-kind")}:${s.attributes("data-id")}`)).toEqual(["party_member:m1", "canon:b1"]);
  });

  // Bug caught: a person tied about from the backstory AND to the character was listed in both blocks.
  it("leaves an about tie out of the second block when that person is in the character's list", () => {
    ties.byKind = {
      party_member: [tie({ row_id: "pc", type: "mentor", other_id: "maren" })],
      canon: [tie({ row_id: "a", other_id: "maren" }), tie({ row_id: "p", other_kind: "location", other_id: "mill", type: "took_place_at" })],
    };
    const second = mountDetail().findAll("[data-testid=section]")[1]!;
    expect(second.findAll("[data-testid=tie]").map((t) => t.text())).toEqual(["mill"]);
  });

  // Bug caught: hiding every about tie to a person, so someone with no tie to the character vanished from both blocks.
  it("keeps an about tie to a person the character has no tie to", () => {
    ties.byKind = { party_member: [], canon: [tie({ row_id: "a", other_id: "stranger" })] };
    const second = mountDetail().findAll("[data-testid=section]")[1]!;
    expect(second.findAll("[data-testid=tie]").map((t) => t.text())).toEqual(["stranger"]);
  });

  // Bug caught: the character's list not saying which of its people came from the backstory.
  it("hands the first block the NPCs the backstory is about, to mark", () => {
    ties.byKind = {
      party_member: [tie({ row_id: "pc", type: "mentor", other_id: "maren" }), tie({ row_id: "pd", type: "friend", other_id: "harl" })],
      canon: [tie({ row_id: "a", other_id: "maren" })],
    };
    const first = mountDetail().findAll("[data-testid=section]")[0]!;
    expect(first.findAll("[data-testid=tie]").map((t) => t.attributes("data-marked"))).toEqual(["true", "false"]);
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
      expect(mocks.createEntry).toHaveBeenCalledWith({ part: "question", title: "Who burned the mill?" });
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
