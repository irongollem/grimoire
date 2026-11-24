import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), remove: vi.fn() }));
const rows = ref<Connection[]>([]);

vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: () => ({ data: rows, isLoading: ref(false), isError: ref(false) }),
  useCreateConnection: () => ({ mutateAsync: mocks.create }),
  useRemoveConnection: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update }),
}));

const questData = vi.hoisted(() => ({ quests: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonForces", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: { value: { steps: [], ticks: [], quests: questData.quests } } }),
}));
const EntryQuestsStub = { name: "EntryQuests", props: ["entry", "links", "label", "empty"], template: "<div data-testid='entry-quests' />" };
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

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
const ConnectionsStub = { name: "ConnectionsSection", props: ["hide"], template: "<div />" };

function mountDetail(e: CanonEntry) {
  return mount(TruthDetail, {
    props: { entry: e },
    global: { stubs: { EntryQuests: EntryQuestsStub, EntryStoryLinks: EntryStoryLinksStub, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, ConnectionsSection: ConnectionsStub, CanonEntryNotes: true, WorldEntityPicker: PickerStub } },
  });
}

describe("TruthDetail", () => {
  beforeEach(() => {
    rows.value = [];
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue(undefined);
  });

  // Bug caught (#1255 item 8): the truth had nowhere to write why it matters, or the notes were bound to another entry.
  it("mounts the notes for this truth", () => {
    expect(mountDetail(entry()).getComponent(CanonEntryNotes).props("entry")).toMatchObject({ id: "t1" });
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
    const hide = mountDetail(entry()).getComponent(ConnectionsStub).props("hide") as (c: Connection) => boolean;
    for (const type of ["led_to", "carries"]) {
      expect(hide(knower({ type }))).toBe(true);
      expect(hide(knower({ type, outward: false }))).toBe(true);
    }
    expect(hide(knower({ type: "related_to" }))).toBe(false);
  });

  it("mounts the story links for this truth", () => {
    expect(mountDetail(entry()).getComponent(EntryStoryLinksStub).props("entry")).toMatchObject({ id: "t1" });
  });

  it("hides the known_to ties from the Connections block, and only those", () => {
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

  // Bug caught: an entry reading in its own order (connections above the text), so a truth did not read like every other chapter's entry.
  it("reads title, who, text, the who-knows block, then connections", () => {
    const html = mountDetail(entry({ from_fact_id: "f1" })).html();
    const at = ["aria-label=\"The truth\"", "truth-from-table", "canon-entry-notes-stub", "Who knows it", "Delete this truth"].map((m) => html.indexOf(m));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
