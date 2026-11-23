import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), updateAsync: vi.fn(), create: vi.fn(), toastError: vi.fn(), confirm: vi.fn(), setFound: vi.fn(), destroyClue: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const party = ref<{ id: string }[] | undefined>([]);
const passages = ref<{ id: string; entry_id: string; title: string }[]>([]);

const entries = ref<CanonEntry[]>([]);
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update, mutateAsync: mocks.updateAsync }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create }),
  useCanonEntries: () => ({ data: entries }),
}));
vi.mock("@/composables/canon/useCanonClues", () => ({
  useCanonClues: () => ({ data: clues }),
  useCreateCanonClue: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useUpdateCanonClue: () => ({ mutate: vi.fn() }),
  useDeleteCanonClue: () => ({ mutateAsync: mocks.destroyClue }),
  useSetClueFound: () => mocks.setFound,
}));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => ref(() => null), useBeatOptions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: passages }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

const questData = vi.hoisted(() => ({ quests: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonForces", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: { value: { steps: [], ticks: [], quests: questData.quests } } }),
}));
const EntryQuestsStub = { name: "EntryQuests", props: ["entry", "links", "label", "empty"], template: "<div data-testid='entry-quests' />" };
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import SecretDetail from "./SecretDetail.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import SecretBeats from "./SecretBeats.vue";

const secret = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter.", ...over });
const clue = (over: Partial<CanonClue> = {}): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const mountDetail = (e: CanonEntry) => mount(SecretDetail, { props: { entry: e }, global: { stubs: { EntryQuests: EntryQuestsStub, ConnectionsSection: true, SecretBeats: true, CanonEntryNotes: true, ClueForm: true, CanonSuggestions: true, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } } });

describe("SecretDetail", () => {
  beforeEach(() => {
    clues.value = [clue(), clue({ id: "k2", title: "A carving" })];
    party.value = [{ id: "pm1" }, { id: "pm2" }];
    passages.value = [];
    entries.value = [];
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  // Bug caught (#1255 item 21): the beats list asked about another secret (or none), so a secret showed no beats or another's.
  it("lists the beats tied to this secret", () => {
    expect(mountDetail(secret()).getComponent(SecretBeats).props("secretId")).toBe("s1");
  });

  // Bug caught (#1255 item 8): the secret had nowhere to write what is really going on, or the notes were bound to another entry.
  it("mounts the notes for this secret", () => {
    expect(mountDetail(secret()).getComponent(CanonEntryNotes).props("entry")).toMatchObject({ id: "s1" });
  });

  // Bug caught (#1255 item 5): a clue that is a lore passage read "Not placed anywhere yet", as if it were unplaced.
  it("names the lore passage a clue is, and not as lying nowhere", () => {
    passages.value = [{ id: "g1", entry_id: "l1", title: "What was under the chapel" }];
    clues.value = [clue({ passage_id: "g1" }), clue({ id: "k2", title: "A carving" })];
    const rows = mountDetail(secret()).findAll("[data-testid=clue-row]");
    expect(rows[0].find("[data-testid=clue-passage]").text()).toBe("A lore passage: What was under the chapel");
    expect(rows[0].find("[data-testid=clue-nowhere]").exists()).toBe(false);
    expect(rows[1].find("[data-testid=clue-nowhere]").exists()).toBe(true);
  });

  it("writes nothing when the DM cancels the reveal, so a stray click never shows the party a secret", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountDetail(secret());
    await w.find("[data-testid=reveal]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reveals to every party member and stamps the time once the DM confirms", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountDetail(secret());
    await w.find("[data-testid=reveal]").trigger("click");
    await flushPromises();
    const call = mocks.update.mock.calls[0][0];
    expect(call.id).toBe("s1");
    expect(call.patch.player_visible_to).toEqual(["pm1", "pm2"]);
    expect(Number.isNaN(Date.parse(call.patch.revealed_at))).toBe(false);
  });

  it("offers Hide again, not Reveal, once revealed, and clears revealed_at", async () => {
    const w = mountDetail(secret({ revealed_at: "2026-11-02T20:00:00Z" }));
    expect(w.find("[data-testid=reveal]").exists()).toBe(false);
    await w.find("[data-testid=hide]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { revealed_at: null } });
  });

  it("shows partly known with the tally once a clue is found", () => {
    clues.value = [clue({ found_at: "2026-11-18T20:00:00Z" }), clue({ id: "k2" })];
    const w = mountDetail(secret());
    expect(w.find("[data-testid=secret-state]").text()).toContain("Partly known");
    expect(w.text()).toContain("1 of 2 clues found");
  });

  it("ticks a clue through the shared Found tick", async () => {
    const w = mountDetail(secret());
    await w.findAll("input[type=checkbox]")[0].setValue(true);
    expect(mocks.setFound).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }), true);
  });

  it("reveals nothing, and does not even ask, before the party has loaded: it would share with nobody", async () => {
    party.value = undefined;
    const w = mountDetail(secret());
    await w.find("[data-testid=reveal]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("deletes no clue when the removal is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountDetail(secret());
    await w.find("button[aria-label='Remove this clue']").trigger("click");
    await flushPromises();
    expect(mocks.destroyClue).not.toHaveBeenCalled();
  });

  it("deletes the clue once the removal is confirmed", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountDetail(secret());
    await w.find("button[aria-label='Remove this clue']").trigger("click");
    await flushPromises();
    expect(mocks.destroyClue).toHaveBeenCalledWith("k1");
  });

  it("saves the statement through the committed-text rule: a blank statement writes nothing", async () => {
    const w = mountDetail(secret());
    await w.find("textarea[aria-label='The secret']").setValue("  ");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  const revealed = (over: Partial<CanonEntry> = {}) => secret({ revealed_at: "2026-11-23T10:00:00Z", body: "{\"type\":\"doc\"}", ...over });

  // Bug caught (#1255 item 10): Make it a truth offered on a secret the party has not learned, publishing it by the back door.
  it("offers Make it a truth only on a revealed secret", () => {
    expect(mountDetail(secret()).find("[data-testid=make-truth]").exists()).toBe(false);
    expect(mountDetail(revealed()).find("[data-testid=make-truth]").exists()).toBe(true);
  });

  // Bug caught: the truth got the wrong knowledge, lost the secret's notes, or the secret was not pointed at it.
  it("makes a truth known to all with the secret's words and notes, then points the secret at it", async () => {
    mocks.create.mockResolvedValue(canonEntry({ id: "t7", part: "truth" }));
    mocks.updateAsync.mockResolvedValue(undefined);
    const w = mountDetail(revealed());
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "truth", knowledge: "all", title: "Sift is the guild master's daughter.", body: "{\"type\":\"doc\"}" });
    expect(mocks.updateAsync).toHaveBeenCalledWith({ id: "s1", patch: { became_entry_id: "t7" } });
  });

  // Bug caught: a failed pointer deleted the truth just made, or failed silently.
  it("keeps the truth and says so when the secret cannot be pointed at it", async () => {
    mocks.create.mockResolvedValue(canonEntry({ id: "t7", part: "truth" }));
    mocks.updateAsync.mockRejectedValue(new Error("no"));
    const w = mountDetail(revealed());
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  // Bug caught: the button stayed after the secret became a truth, so it could be made twice.
  it("replaces the button with a link to the truth it became", () => {
    entries.value = [canonEntry({ id: "t7", part: "truth", title: "Sift is the daughter." })];
    const w = mountDetail(revealed({ became_entry_id: "t7" }));
    expect(w.find("[data-testid=make-truth]").exists()).toBe(false);
    expect(w.get("[data-testid=secret-became]").text()).toBe("Now a truth: Sift is the daughter.");
  });
  // Bug caught: the block showing another entry's quests (or another part's words), so a secret read as a force's "where the party meets it".
  it("shows this secret's own quest links, in the secret's words", () => {
    questData.quests = [
      { id: "l1", entry_id: "s1", quest_id: "q1" },
      { id: "l2", entry_id: "someone-else", quest_id: "q2" },
    ];
    const block = mountDetail(secret()).getComponent(EntryQuestsStub);
    expect(block.props("links")).toEqual([expect.objectContaining({ id: "l1" })]);
    expect(block.props("label")).toBe("The quests that uncover it");
    expect(block.props("empty")).toBe("No quest is built to uncover this yet.");
  });
});
