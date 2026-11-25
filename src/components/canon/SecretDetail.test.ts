import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), updateAsync: vi.fn(), create: vi.fn(), toastError: vi.fn(), confirm: vi.fn(), setFound: vi.fn(), destroyClue: vi.fn(), connect: vi.fn(), createClue: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const party = ref<{ id: string; name: string }[] | undefined>([]);
const session = ref<{ id: string } | null>({ id: "sess1" });
const passages = ref<{ id: string; entry_id: string; title: string }[]>([]);

const entries = ref<CanonEntry[]>([]);
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update, mutateAsync: mocks.updateAsync }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create }),
  useCanonEntries: () => ({ data: entries }),
}));
vi.mock("@/composables/canon/useCanonClues", async (importOriginal) => ({
  cluePlacement: (await importOriginal<typeof import("@/composables/canon/useCanonClues")>()).cluePlacement,
  useCanonClues: () => ({ data: clues }),
  useCreateCanonClue: () => ({ mutateAsync: mocks.createClue, isPending: ref(false) }),
  useUpdateCanonClue: () => ({ mutate: vi.fn() }),
  useDeleteCanonClue: () => ({ mutateAsync: mocks.destroyClue }),
  useSetClueFound: () => mocks.setFound,
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.connect }),
  useRemoveConnection: () => ({ mutateAsync: vi.fn() }),
  useConnections: () => ({ data: ref([]), isLoading: ref(false), isError: ref(false) }),
}));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => ref(() => null), useBeatOptions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: passages }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => ref(true) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import SecretDetail from "./SecretDetail.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import SecretOutlets from "./SecretOutlets.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import type { Connection } from "@/types/connections.types";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import { useAskUiStore } from "@/stores/ui/ask";

const secret = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter.", ...over });
const clue = (over: Partial<CanonClue> = {}): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, item_id: null, document_id: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const mountDetail = (e: CanonEntry) => mount(SecretDetail, { props: { entry: e }, global: { stubs: { CanonReview: true, EntryStoryLinks: true, ConnectionsSection: true, SecretOutlets: true, CanonEntryNotes: true, ClueForm: true, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } } });

describe("SecretDetail", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clues.value = [clue(), clue({ id: "k2", title: "A carving" })];
    party.value = [{ id: "pm1", name: "Mira" }, { id: "pm2", name: "Bram" }];
    session.value = { id: "sess1" };
    passages.value = [];
    entries.value = [];
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  // Bug caught: the Clues block's Suggest asked the Familiar for something that names no secret, or was left out of the block.
  it("asks the Familiar for clues for this secret from the Clues block", async () => {
    const open = vi.spyOn(useAskUiStore(), "openPanel").mockImplementation(() => undefined);
    await mountDetail(secret()).get("section[aria-label=Clues] [data-testid=canon-suggest]").trigger("click");
    expect(open).toHaveBeenCalledWith('Suggest clues for the secret "Sift is the guild master\'s daughter.".', { send: false });
  });

  // Bug caught (#1258 item 3): the outlets block was handed another secret, or none of this secret's clues, so it could not group them.
  it("gives the outlets block this secret and its clues", () => {
    const block = mountDetail(secret()).getComponent(SecretOutlets);
    expect(block.props("entry")).toMatchObject({ id: "s1" });
    expect(block.props("clues")).toHaveLength(2);
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
    // Bug caught (#1258 item 23): a revealed secret never said which session it came out in.
    expect(call.patch.revealed_session_id).toBe("sess1");
  });

  // Bug caught (#1258 item 23): "Reveal to…" shared the secret with the whole party, or stamped no session, or wrote
  // before the DM chose anyone.
  it("reveals to only the characters ticked under Reveal to…, and stamps the open session", async () => {
    const w = mountDetail(secret());
    await w.get("[data-testid=reveal-some]").trigger("click");
    expect(mocks.update).not.toHaveBeenCalled();
    await w.get("[data-testid=tell-some-pm2]").setValue(true);
    await w.get("[data-testid=tell-some-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const { id, patch } = mocks.update.mock.calls[0][0];
    expect(id).toBe("s1");
    expect(patch.player_visible_to).toEqual(["pm2"]);
    expect(patch.revealed_session_id).toBe("sess1");
    expect(Number.isNaN(Date.parse(patch.revealed_at))).toBe(false);
  });

  // Bug caught: cancelling the picker still revealed the secret.
  it("reveals nothing when the DM cancels the picker", async () => {
    const w = mountDetail(secret());
    await w.get("[data-testid=reveal-some]").trigger("click");
    await w.get("[data-testid=tell-some-cancel]").trigger("click");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(w.find("[data-testid=tell-some]").exists()).toBe(false);
  });

  // Bug caught: Reveal to… offered on a secret already revealed, so a second reveal could overwrite who reads it.
  it("offers Reveal to… only while the secret is hidden", () => {
    expect(mountDetail(secret({ revealed_at: "2026-11-02T20:00:00Z" })).find("[data-testid=reveal-some]").exists()).toBe(false);
  });

  // Bug caught (#1258 item 18, mounted here by item 23): the cause-and-effect block was handed no entry, or another one.
  it("mounts the story links for this secret", () => {
    expect(mountDetail(secret()).getComponent(EntryStoryLinks).props("entry")).toMatchObject({ id: "s1" });
  });

  // Bug caught (#1258 item 13): Hide again on a secret that became a truth hid it silently, leaving the truth known to all
  // beside a hidden secret. It asks first, and a "no" writes nothing.
  it("asks before hiding a secret that became a truth, and hides nothing when refused", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountDetail(revealed({ became_entry_id: "t7" }));
    await w.get("[data-testid=hide]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith("The truth it became stays known to all. Hide the secret anyway?", expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await w.get("[data-testid=hide]").trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { revealed_at: null, revealed_session_id: null } });
  });

  // Bug caught: the question was asked of every secret, so hiding one that never became a truth needed a pointless confirm.
  it("hides a secret that never became a truth without asking", async () => {
    const w = mountDetail(revealed());
    await w.get("[data-testid=hide]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { revealed_at: null, revealed_session_id: null } });
  });

  it("offers Hide again, not Reveal, once revealed, and clears revealed_at", async () => {
    const w = mountDetail(secret({ revealed_at: "2026-11-02T20:00:00Z" }));
    expect(w.find("[data-testid=reveal]").exists()).toBe(false);
    await w.find("[data-testid=hide]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { revealed_at: null, revealed_session_id: null } });
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
    const w = mountDetail(revealed({ player_visible_to: ["pm1", "pm2"] }));
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "truth", knowledge: "all", title: "Sift is the guild master's daughter.", body: "{\"type\":\"doc\"}" });
    expect(mocks.updateAsync).toHaveBeenCalledWith({ id: "s1", patch: { became_entry_id: "t7" } });
    // Bug caught (#1279 item 3): a whole-party secret grew per-person links it does not need.
    expect(mocks.connect).not.toHaveBeenCalledWith(expect.objectContaining({ choice: expect.objectContaining({ key: "known_to" }) }));
  });

  // Bug caught (#1279 item 3): a secret revealed to Mira only became a truth known to "all", so every player read it.
  it("makes a truth known to some, with a known_to link per reader, when the secret is revealed to only some", async () => {
    mocks.create.mockResolvedValue(canonEntry({ id: "t7", part: "truth" }));
    mocks.updateAsync.mockResolvedValue(undefined);
    const w = mountDetail(revealed({ player_visible_to: ["pm1"] }));
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ part: "truth", knowledge: "some" }));
    const knowers = mocks.connect.mock.calls.filter(([c]) => c.choice.key === "known_to");
    expect(knowers).toHaveLength(1);
    expect(knowers[0][0]).toMatchObject({ subject: { kind: "canon", id: "t7" }, other: { kind: "party_member", id: "pm1", name: "Mira" }, choice: { subjectIsFrom: true } });
  });

  // Bug caught: the party not having loaded made every secret look partly revealed, or "all" by default.
  it("makes no truth before the party has loaded, since who reads it is not known", async () => {
    party.value = undefined;
    const w = mountDetail(revealed({ player_visible_to: ["pm1"] }));
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Bug caught (#1279 item 4): the help line said "The party can read this secret" whoever it was revealed to.
  it("says who a revealed secret is revealed to", () => {
    expect(mountDetail(revealed({ player_visible_to: ["pm1", "pm2"] })).get("[data-testid=revealed-to]").text()).toBe("Revealed to the whole party");
    expect(mountDetail(revealed({ player_visible_to: ["pm1"] })).get("[data-testid=revealed-to]").text()).toBe("Revealed to Mira");
    party.value = [{ id: "pm1", name: "Mira" }, { id: "pm2", name: "Bram" }, { id: "pm3", name: "Cole" }];
    expect(mountDetail(revealed({ player_visible_to: ["pm1", "pm2"] })).get("[data-testid=revealed-to]").text()).toBe("Revealed to Mira and Bram");
  });

  // Bug caught (#1279 item 4): a partly revealed secret offered no way to widen it, and a whole-party one offered a pointless one.
  it("offers Reveal to more… only on a secret not yet revealed to the whole party", () => {
    expect(mountDetail(revealed({ player_visible_to: ["pm1"] })).find("[data-testid=reveal-more]").exists()).toBe(true);
    expect(mountDetail(revealed({ player_visible_to: ["pm1", "pm2"] })).find("[data-testid=reveal-more]").exists()).toBe(false);
    expect(mountDetail(secret()).find("[data-testid=reveal-more]").exists()).toBe(false);
  });

  // Bug caught (#1279 item 4): widening restamped the reveal time and session, or replaced who had it instead of adding to it.
  it("adds the members ticked under Reveal to more…, keeping those who have it and the time it came out", async () => {
    const w = mountDetail(revealed({ player_visible_to: ["pm1"], revealed_session_id: "sess0" }));
    await w.get("[data-testid=reveal-more]").trigger("click");
    expect((w.get("[data-testid=tell-some-pm1]").element as HTMLInputElement).checked).toBe(true);
    await w.get("[data-testid=tell-some-pm2]").setValue(true);
    await w.get("[data-testid=tell-some-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { player_visible_to: ["pm1", "pm2"] } });
  });

  // Bug caught: confirming the picker with nobody new ticked wrote anyway.
  it("writes nothing when Reveal to more… adds no one", async () => {
    const w = mountDetail(revealed({ player_visible_to: ["pm1"] }));
    await w.get("[data-testid=reveal-more]").trigger("click");
    await w.get("[data-testid=tell-some-confirm]").trigger("click");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // Bug caught (#1279 item 3, with #1258 items 6 and 18): the Connections block listed the led_to and carries ties again beside the story links that own them.
  it("keeps led_to and carries ties out of its Connections block, and nothing else", () => {
    const conn = (over: Partial<Connection>): Connection => ({
      source: "link", row_id: "r", type: "about", outward: true, other_kind: "npc", other_id: "n1", other_name: "Sift",
      other_image: null, note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
    });
    const hide = mountDetail(secret()).getComponent(ConnectionsSection).props("hide") as (c: Connection) => boolean;
    expect(hide(conn({ type: "led_to" }))).toBe(true);
    expect(hide(conn({ type: "carries" }))).toBe(true);
    expect(hide(conn({ type: "about" }))).toBe(false);
    expect(hide(conn({ type: "led_to", source: "kin" }))).toBe(false);
  });

  // Bug caught (#1258 item 18): the truth was pointed at but no canon led_to link was written, so the secret's
  // Connections and the web never showed where it led.
  it("writes a led_to link from the secret to the truth it became", async () => {
    mocks.create.mockResolvedValue(canonEntry({ id: "t7", part: "truth", title: "Sift is the daughter." }));
    mocks.updateAsync.mockResolvedValue(undefined);
    const w = mountDetail(revealed());
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "canon", id: "s1" },
      other: expect.objectContaining({ kind: "canon", id: "t7" }),
      choice: expect.objectContaining({ key: "led_to", subjectIsFrom: true }),
    }));
  });

  // Bug caught: a failed pointer deleted the truth just made, or failed silently.
  it("keeps the truth and says so when the secret cannot be pointed at it", async () => {
    mocks.create.mockResolvedValue(canonEntry({ id: "t7", part: "truth" }));
    mocks.updateAsync.mockRejectedValue(new Error("no"));
    const w = mountDetail(revealed());
    await w.get("[data-testid=make-truth]").trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  // Bug caught: the button stayed after the secret became a truth, so it could be made twice.
  it("replaces the button with a link to the truth it became", () => {
    entries.value = [canonEntry({ id: "t7", part: "truth", title: "Sift is the daughter." })];
    const w = mountDetail(revealed({ became_entry_id: "t7" }));
    expect(w.find("[data-testid=make-truth]").exists()).toBe(false);
    expect(w.get("[data-testid=secret-became]").text()).toBe("Now a truth: Sift is the daughter.");
  });
});
