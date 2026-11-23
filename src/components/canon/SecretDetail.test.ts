import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), confirm: vi.fn(), setFound: vi.fn(), destroyClue: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const party = ref<{ id: string }[] | undefined>([]);
const passages = ref<{ id: string; entry_id: string; title: string }[]>([]);

vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
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

import SecretDetail from "./SecretDetail.vue";

const secret = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter.", ...over });
const clue = (over: Partial<CanonClue> = {}): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const mountDetail = (e: CanonEntry) => mount(SecretDetail, { props: { entry: e }, global: { stubs: { ConnectionsSection: true, ClueForm: true, CanonSuggestions: true, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } } });

describe("SecretDetail", () => {
  beforeEach(() => {
    clues.value = [clue(), clue({ id: "k2", title: "A carving" })];
    party.value = [{ id: "pm1" }, { id: "pm2" }];
    passages.value = [];
    Object.values(mocks).forEach((m) => m.mockReset());
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
});
