import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), remove: vi.fn(), createEntry: vi.fn(), push: vi.fn(), linkBecame: vi.fn() }));
const rows = ref<Connection[]>([]);
const allEntries = ref<CanonEntry[]>([]);
const links = ref<unknown[]>([]);
const party = ref<{ id: string; name: string }[]>([{ id: "pm1", name: "Mira" }, { id: "pm2", name: "Bram" }]);
const session = ref<{ id: string } | null>({ id: "sess1" });
const sessions = ref<{ id: string; number: number | null }[]>([{ id: "sess1", number: 4 }]);
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: sessions }) }));
vi.mock("@/composables/canon/useLinkBecame", () => ({ useLinkBecame: () => mocks.linkBecame }));

vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: () => ({ data: rows, isLoading: ref(false), isError: ref(false) }),
  useCampaignLinks: () => ({ data: links }),
  useCreateConnection: () => ({ mutateAsync: mocks.create }),
  useRemoveConnection: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update, mutateAsync: mocks.update }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }),
  useCanonEntries: () => ({ data: allEntries }),
}));

const questData = vi.hoisted(() => ({ quests: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonForces", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: { value: { steps: [], ticks: [], quests: questData.quests } } }),
}));
const EntryQuestsStub = { name: "EntryQuests", props: ["entry", "links", "label", "empty"], template: "<div data-testid='entry-quests' />" };
const arcs = ref<{ id: string; name: string }[]>([]);
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: arcs, isSuccess: ref(true) }) }));

import TruthDetail from "./TruthDetail.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";

const entry = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({
  id: "t1", part: "truth", knowledge: "some", title: "The river gives back.", ...over,
});

const knower = (over: Partial<Connection> = {}): Connection => ({
  source: "link", row_id: "k1", type: "known_to", outward: true, other_kind: "faction", other_id: "f1",
  other_name: "The Ferrymen", other_image: null, note: null, told: null, player_visible_to: null,
  ai_provenance: null, role: null, status: null, ...over,
});

const PickerStub = {
  name: "WorldEntityPicker",
  emits: ["pick"],
  template: `<button data-testid="pick" @click="$emit('pick', { kind: 'faction', id: 'f9', name: 'The Gilded' })">pick</button>`,
};

const EntryStoryLinksStub = { name: "EntryStoryLinks", props: ["entry"], template: "<div data-testid='story-links' />" };
const TellSomeStub = { name: "PassageTellSome", props: ["members", "told", "tellLabel"], emits: ["tell", "cancel"], template: `<button data-testid="tell-some-confirm" @click="$emit('tell', ['pm2'])">{{ tellLabel }}</button>` };
const ConnectionsStub = { name: "ConnectionsSection", props: ["hide"], template: "<div />" };

function mountDetail(e: CanonEntry) {
  return mount(TruthDetail, {
    props: { entry: e },
    global: { stubs: { EntryQuests: EntryQuestsStub, EntryStoryLinks: EntryStoryLinksStub, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, ConnectionsSection: ConnectionsStub, CanonEntryNotes: true, WorldEntityPicker: PickerStub, PassageTellSome: TellSomeStub, teleport: true } },
  });
}

describe("TruthDetail", () => {
  beforeEach(() => {
    rows.value = [];
    allEntries.value = [];
    links.value = [];
    arcs.value = [];
    questData.quests = [];
    party.value = [{ id: "pm1", name: "Mira" }, { id: "pm2", name: "Bram" }];
    session.value = { id: "sess1" };
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue(undefined);
  });

  // Bug caught (#1255 item 8): the truth had nowhere to write why it matters, or the notes were bound to another entry.
  it("mounts the notes for this truth once it has words", () => {
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "It matters." }] }] });
    expect(mountDetail(entry({ body })).getComponent(CanonEntryNotes).props("entry")).toMatchObject({ id: "t1" });
  });

  it("asks the DM to name who knows a truth marked 'some' while nobody is named", () => {
    const w = mountDetail(entry());
    expect(w.find("[data-testid=name-who-knows]").exists()).toBe(true);
  });

  it("stops asking once someone is named, and lists them", () => {
    rows.value = [knower()];
    const w = mountDetail(entry());
    expect(w.find("[data-testid=name-who-knows]").exists()).toBe(false);
    expect(w.find("[data-testid=known-to]").text()).toContain("The Ferrymen");
  });

  it("offers no 'known to' list for a truth known to all, whose audience is everyone", () => {
    const w = mountDetail(entry({ knowledge: "all" }));
    expect(w.find("[data-testid=known-to]").exists()).toBe(false);
  });

  it("changing the mark saves it, and choosing 'some' opens the picker so the DM names who", async () => {
    const w = mountDetail(entry({ knowledge: "all" }));
    await w.findAll("button").find((b) => b.text() === "Known to some")!.trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: { knowledge: "some" } });
  });

  it("names a picked faction through a known_to link from the truth, not a second link path", async () => {
    const w = mountDetail(entry());
    await w.findAll("button").find((b) => b.text() === "Who else knows")!.trigger("click");
    await w.find("[data-testid=pick]").trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: "canon", id: "t1" },
        other: { kind: "faction", id: "f9", name: "The Gilded" },
        choice: expect.objectContaining({ key: "known_to", subjectIsFrom: true }),
      }),
    );
  });

  it("does not name someone already named, which would write the same link twice", async () => {
    rows.value = [knower({ other_id: "f9" })];
    const w = mountDetail(entry());
    await w.findAll("button").find((b) => b.text() === "Who else knows")!.trigger("click");
    await w.find("[data-testid=pick]").trigger("click");
    await flushPromises();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("removes a knower through the connection's own removal", async () => {
    rows.value = [knower()];
    const w = mountDetail(entry());
    await w.find("button[aria-label='The Ferrymen no longer knows it']").trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ connection: expect.objectContaining({ row_id: "k1" }) }));
  });

  it("saves edited words once, and a blank edit puts the old words back instead of saving nothing", async () => {
    const w = mountDetail(entry());
    const input = w.find("textarea[aria-label='The truth']");
    await input.setValue("The river gives back, changed.");
    await input.trigger("change");
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: { title: "The river gives back, changed." } });
    mocks.update.mockClear();
    await input.setValue("  ");
    await input.trigger("change");
    expect(mocks.update).not.toHaveBeenCalled();
    // The field is remade on a revert, so look it up again.
    expect((w.find("textarea[aria-label='The truth']").element as HTMLInputElement).value).toBe("The river gives back.");
  });

  // Bug caught (#1255 item 22): a truth made at the table not saying so, or every truth claiming to have begun there.
  it("says a truth began at the table only when it was made from a fact", () => {
    expect(mountDetail(entry()).find("[data-testid=truth-from-table]").exists()).toBe(false);
    const w = mountDetail(entry({ from_fact_id: "f1" }));
    expect(w.find("[data-testid=truth-from-table]").text()).toBe("First said at the table.");
    expect(w.find("[data-testid=truth-from-table] a").attributes("href")).toBe("/table/story");
  });
  // Bug caught: the block showing another entry's quests (or another part's words), so a truth read as a force's "where the party meets it".
  it("shows this truth's own quest links, in the truth's words", () => {
    questData.quests = [
      { id: "l1", entry_id: "t1", quest_id: "q1" },
      { id: "l2", entry_id: "someone-else", quest_id: "q2" },
    ];
    const block = mountDetail(entry()).getComponent(EntryQuestsStub);
    expect(block.props("links")).toEqual([expect.objectContaining({ id: "l1" })]);
    expect(block.props("label")).toBe("The quests that turn on it");
    expect(block.props("empty")).toBe("No quest turns on this yet.");
  });

  // Bug caught (#1258 item 6): "who knows it" was drawn twice, once as Known to and again in the Connections block,
  // because the block got no filter. Other ties (a place, a faction it is about) must still show.
  // Bug caught (#1258 item 18): cause and effect listed twice, once in the story links and again as raw led_to / carries rows.
  it("hides led_to and carries ties, in either direction, from the Connections block", () => {
    rows.value = [knower({ type: "related_to", row_id: "r1" })];
    const hide = mountDetail(entry()).getComponent(ConnectionsStub).props("hide") as (c: Connection) => boolean;
    for (const type of ["led_to", "carries"]) {
      expect(hide(knower({ type }))).toBe(true);
      expect(hide(knower({ type, outward: false }))).toBe(true);
    }
    expect(hide(knower({ type: "related_to" }))).toBe(false);
  });

  it("mounts the story links for this truth once it has a cause, an effect or a theme", () => {
    links.value = [{ from_kind: "canon", to_kind: "canon", type: "led_to", from_id: "t1", to_id: "t2" }];
    expect(mountDetail(entry()).getComponent(EntryStoryLinksStub).props("entry")).toMatchObject({ id: "t1" });
  });

  it("hides the known_to ties from the Connections block, and only those", () => {
    rows.value = [knower({ type: "related_to", row_id: "r1" })];
    const hide = mountDetail(entry()).getComponent(ConnectionsStub).props("hide") as (c: Connection) => boolean;
    expect(hide(knower())).toBe(true);
    expect(hide(knower({ type: "about" }))).toBe(false);
    expect(hide(knower({ outward: false }))).toBe(false);
  });

  // Bug caught: the delete and the close wired to the wrong event, so the chapter deleted when asked to close, or the page never heard either.
  it("asks the chapter to close or delete through the pane's own buttons", async () => {
    const w = mountDetail(entry());
    await w.get("button[aria-label='Close this truth']").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("delete")).toBeUndefined();
    await w.findAll("button").find((b) => b.text() === "Delete this truth")!.trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
  });

  describe("the Add… fold (#1279 item 16)", () => {
    const bodyOf = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const menu = (w: ReturnType<typeof mountDetail>) => w.findAll("[data-slip] button").map((b) => b.text());

    // Bug caught: every empty block drawn at once, so a one-line truth opened as a wall of empty editors and pickers.
    it("draws no empty optional block, and offers each one in the Add… menu", async () => {
      arcs.value = [{ id: "a1", name: "The Drowning" }];
      const w = mountDetail(entry());
      expect(w.find("[data-testid=entry-quests]").exists()).toBe(false);
      expect(w.find("[data-testid=story-links]").exists()).toBe(false);
      expect(w.findComponent(ConnectionsStub).exists()).toBe(false);
      expect(w.findComponent(CanonEntryNotes).exists()).toBe(false);
      expect(w.find("[data-testid=entry-arc]").exists()).toBe(false);
      await w.get("[data-testid=canon-add-fold-button]").trigger("click");
      expect(menu(w)).toEqual(["An arc", "More about it", "A quest", "A cause, an effect or a theme", "A connection"]);
    });

    // Bug caught: a block with data folded away (a truth that has a quest losing it from view), or still offered to add again.
    it("draws a block that holds data and leaves it out of the menu", async () => {
      questData.quests = [{ id: "l1", entry_id: "t1", quest_id: "q1" }];
      rows.value = [knower({ type: "related_to", row_id: "r1" })];
      const w = mountDetail(entry({ body: bodyOf("Why it matters.") }));
      expect(w.find("[data-testid=entry-quests]").exists()).toBe(true);
      expect(w.findComponent(ConnectionsStub).exists()).toBe(true);
      expect(w.findComponent(CanonEntryNotes).exists()).toBe(true);
      await w.get("[data-testid=canon-add-fold-button]").trigger("click");
      expect(menu(w)).toEqual(["A cause, an effect or a theme"]);
    });

    // Bug caught: a truth whose only tie is the "who knows it" row counting as having connections, so the empty block never folded.
    it("does not count a tie another block already draws as a connection", () => {
      rows.value = [knower()];
      expect(mountDetail(entry()).findComponent(ConnectionsStub).exists()).toBe(false);
    });

    // Bug caught: choosing a block only closed the menu, so nothing appeared; or it vanished as soon as the DM added to it.
    it("reveals the chosen block and keeps it drawn while the truth is open", async () => {
      const w = mountDetail(entry());
      await w.get("[data-testid=canon-add-fold-button]").trigger("click");
      await w.get("[data-testid=canon-add-quests]").trigger("click");
      expect(w.find("[data-testid=entry-quests]").exists()).toBe(true);
      expect(menu(w)).not.toContain("A quest");
    });

    // Bug caught: a chosen block still showing after the DM opens another truth, so the new truth opened with an empty quest picker.
    it("forgets what was chosen when another truth opens", async () => {
      const w = mountDetail(entry());
      await w.get("[data-testid=canon-add-fold-button]").trigger("click");
      await w.get("[data-testid=canon-add-quests]").trigger("click");
      await w.setProps({ entry: entry({ id: "t2" }) });
      expect(w.find("[data-testid=entry-quests]").exists()).toBe(false);
    });

    // Bug caught: the help paragraph back under the control, which is the density the fold exists to remove.
    it("puts the knowledge help in a tooltip, not a paragraph", () => {
      const w = mountDetail(entry());
      expect(w.text()).not.toContain("anyone in the world may say it");
      expect(w.find("[data-testid=knowledge-help]").exists()).toBe(true);
    });
  });

  describe("Give it clues (#1279 item 14)", () => {
    const secretOf = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({ id: "s9", part: "secret", title: "The river gives back.", ...over });

    // Bug caught: the button offered on a truth anyone may say, where clues make no sense.
    it("is offered only on a truth known to no one", () => {
      expect(mountDetail(entry({ knowledge: "secret" })).find("[data-testid=give-clues-button]").exists()).toBe(true);
      expect(mountDetail(entry({ knowledge: "all" })).find("[data-testid=give-clues-button]").exists()).toBe(false);
    });

    // Bug caught: the secret made without the truth's arc, or never pointed at the truth, so the two never met.
    it("makes a secret with the truth's title and arc, points it at the truth, links them and opens it", async () => {
      mocks.createEntry.mockResolvedValue(secretOf());
      mocks.update.mockResolvedValue(undefined);
      const t = entry({ knowledge: "secret", arc_id: "a1" });
      await mountDetail(t).get("[data-testid=give-clues-button]").trigger("click");
      await flushPromises();
      expect(mocks.createEntry).toHaveBeenCalledWith({ part: "secret", title: "The river gives back.", arc_id: "a1" });
      expect(mocks.update).toHaveBeenCalledWith({ id: "s9", patch: { became_entry_id: "t1" } });
      expect(mocks.linkBecame).toHaveBeenCalledWith(expect.objectContaining({ id: "s9" }), expect.objectContaining({ id: "t1" }));
      expect(mocks.push).toHaveBeenCalledWith({ path: "/canon/secrets", query: { entry: "s9" } });
    });

    // Bug caught: a second tap before the first landed made a second secret for the same truth.
    it("makes one secret for two quick taps", async () => {
      mocks.createEntry.mockResolvedValue(secretOf());
      mocks.update.mockResolvedValue(undefined);
      const w = mountDetail(entry({ knowledge: "secret" }));
      void w.get("[data-testid=give-clues-button]").trigger("click");
      void w.get("[data-testid=give-clues-button]").trigger("click");
      await flushPromises();
      expect(mocks.createEntry).toHaveBeenCalledTimes(1);
    });

    // Bug caught: a failed secret still navigating to a page for a secret that does not exist.
    it("goes nowhere when the secret could not be made", async () => {
      mocks.createEntry.mockRejectedValue(new Error("no"));
      await mountDetail(entry({ knowledge: "secret" })).get("[data-testid=give-clues-button]").trigger("click");
      await flushPromises();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.linkBecame).not.toHaveBeenCalled();
    });

    // Bug caught: a truth that already has its secret offered a second one.
    it("links to the secret that already became this truth instead of offering another", () => {
      allEntries.value = [secretOf({ became_entry_id: "t1", title: "Whose river?" })];
      const w = mountDetail(entry({ knowledge: "secret" }));
      expect(w.find("[data-testid=give-clues-button]").exists()).toBe(false);
      expect(w.get("[data-testid=clues-in]").text()).toContain("Its clues are in");
      expect(w.get("[data-testid=clues-in]").text()).toContain("Whose river?");
    });
  });

  describe("Tell the party (#1279 item 27)", () => {
    // Bug caught: the truth marked known to all with no time or session, so it never counts as news for the players.
    it("tells the party: known to all, stamped with the time and the open session", async () => {
      await mountDetail(entry({ knowledge: "some" })).get("[data-testid=tell-party]").trigger("click");
      const call = mocks.update.mock.calls[0]![0] as { id: string; patch: { knowledge: string; revealed_at: string; revealed_session_id: string } };
      expect(call.id).toBe("t1");
      expect(call.patch).toMatchObject({ knowledge: "all", revealed_session_id: "sess1" });
      expect(Number.isNaN(Date.parse(call.patch.revealed_at))).toBe(false);
    });

    // Bug caught: telling while no session runs inventing a session id, or refusing to tell.
    it("stamps no session when none runs", async () => {
      session.value = null;
      await mountDetail(entry({ knowledge: "some" })).get("[data-testid=tell-party]").trigger("click");
      expect(mocks.update.mock.calls[0]![0].patch.revealed_session_id).toBeNull();
    });

    // Bug caught: "Tell…" marking the truth known to all, so a truth told to one character reached the whole party.
    it("tells chosen characters: each named as a knower, the truth known to some", async () => {
      const w = mountDetail(entry({ knowledge: "some" }));
      await w.get("[data-testid=tell-some]").trigger("click");
      await w.get("[data-testid=tell-some-confirm]").trigger("click");
      await flushPromises();
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ other: { kind: "party_member", id: "pm2", name: "Bram" }, choice: expect.objectContaining({ key: "known_to" }) }));
      expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: expect.objectContaining({ knowledge: "some", revealed_session_id: "sess1" }) });
    });

    // Bug caught (#1279 review): a truth marked known to all before telling existed has no stamp, so the Tell controls
    // show, and "Tell…" narrowed it to some, taking it off every other player's World tab.
    it("offers only Tell the party on a truth already known to all, never Tell…", () => {
      const w = mountDetail(entry({ knowledge: "all", revealed_at: null }));
      expect(w.find("[data-testid=tell-party]").exists()).toBe(true);
      expect(w.find("[data-testid=tell-some]").exists()).toBe(false);
    });

    // Bug caught: telling more later restamping the time and session, so the truth moved to the wrong night in "Canon this session".
    it("keeps the first time and session when told to more", async () => {
      const w = mountDetail(entry({ knowledge: "some", revealed_at: "2026-11-01T10:00:00Z", revealed_session_id: "old" }));
      await w.get("[data-testid=tell-party]").trigger("click");
      expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: { knowledge: "all" } });
    });

    // Bug caught: nothing said who was told or when, so the DM could not tell a told truth from an untold one.
    it("says who was told and in which session", () => {
      expect(mountDetail(entry({ knowledge: "all", revealed_at: "2026-11-01T10:00:00Z", revealed_session_id: "sess1" })).get("[data-testid=told-line]").text()).toBe("Told to the party, session 4");
      rows.value = [knower({ other_kind: "party_member", other_id: "pm1", other_name: "Mira" }), knower({ row_id: "k2", other_kind: "party_member", other_id: "pm2", other_name: "Bram" })].slice(0, 2);
      party.value = [...party.value, { id: "pm3", name: "Cass" }];
      expect(mountDetail(entry({ knowledge: "some", revealed_at: "2026-11-01T10:00:00Z", revealed_session_id: "sess1" })).get("[data-testid=told-line]").text()).toBe("Told to Mira and Bram, session 4");
    });

    // Bug caught: a truth already told to everyone still offering to tell it again.
    it("offers nothing more once told to all, and offers Tell before it is told", () => {
      expect(mountDetail(entry({ knowledge: "all", revealed_at: "2026-11-01T10:00:00Z" })).find("[data-testid=tell-controls]").exists()).toBe(false);
      expect(mountDetail(entry({ knowledge: "all" })).find("[data-testid=tell-controls]").exists()).toBe(true);
    });
  });
});
