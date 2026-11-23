import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonEntry, CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ createEntry: vi.fn(), connect: vi.fn(), push: vi.fn(), toastError: vi.fn() }));
const ties = ref<{ type: string; outward: boolean; other_kind: string; other_id: string }[]>([]);
const entries = ref<CanonEntry[]>([]);
const passages = ref<CanonLorePassage[]>([]);

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }), RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : "?") } }));
vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: () => ({ data: ties }),
  useCreateConnection: () => ({ mutateAsync: mocks.connect }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: entries }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }),
}));
vi.mock("@/composables/canon/useCanonPassages", async (orig) => ({ ...(await orig<typeof import("@/composables/canon/useCanonPassages")>()), useCanonPassages: () => ({ data: passages }) }));

import NpcToldOf from "./NpcToldOf.vue";

const passage = (id: string, entryId: string, sort: number, told = false): CanonLorePassage => ({
  id, user_id: "u", campaign_id: "c", entry_id: entryId, title: id, body: null, sort_order: sort, player_visible_to: [], told_at: told ? "2026-11-20T10:00:00Z" : null,
  told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, author_id: "u", ai_provenance: null, created_at: `2026-11-19T10:00:0${sort}Z`, updated_at: "",
});
const about = (id: string, over = {}) => ({ type: "about", outward: false, other_kind: "canon", other_id: id, ...over });
const mountIt = () => mount(NpcToldOf, { props: { npcId: "n1", name: "Maera" }, global: { stubs: { AppButton: { props: ["label"], emits: ["click"], template: "<button @click=\"$emit('click')\">{{ label }}</button>" } } } });

describe("NpcToldOf", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    ties.value = [];
    entries.value = [];
    passages.value = [];
  });

  // Bug: the block listed lore that is about someone else, or a backstory, or showed no count of what is told.
  it("lists only the lore entries about this person, each with how many passages are told", () => {
    entries.value = [
      canonEntry({ id: "l1", part: "lore", title: "The Fall of the Mere" }),
      canonEntry({ id: "l2", part: "lore", title: "About someone else" }),
      canonEntry({ id: "b1", part: "backstory", title: "A backstory" }),
    ];
    ties.value = [about("l1"), about("b1")];
    // First counts as told with the entry; the third is told on its own; the second is not.
    passages.value = [passage("a", "l1", 0), passage("b", "l1", 1), passage("c", "l1", 2, true)];
    const w = mountIt();
    const rows = w.findAll("[data-testid=npc-lore-row]");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain("The Fall of the Mere");
    expect(rows[0]!.get("[data-testid=npc-lore-told]").text()).toBe("2 of 3 told");
    expect(rows[0]!.get("a").attributes("href")).toBe("l1");
  });

  // Bug: a link the other way (the NPC the from end) was read as lore about them.
  it("ignores a tie that is not an incoming about from canon", () => {
    entries.value = [canonEntry({ id: "l1", part: "lore", title: "The Fall" })];
    ties.value = [about("l1", { outward: true }), about("l1", { type: "mentions" })];
    expect(mountIt().find("[data-testid=npc-lore-row]").exists()).toBe(false);
    expect(mountIt().get("[data-testid=npc-lore-none]").text()).toContain("Maera");
  });

  // Bug: the button made an entry that was not tied to the person, or did not land on it.
  it("writes lore about the person: makes the entry, ties it about them and lands on it", async () => {
    mocks.createEntry.mockResolvedValue({ id: "new1" });
    mocks.connect.mockResolvedValue(undefined);
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.createEntry).toHaveBeenCalledWith({ part: "lore", title: "Lore about Maera" });
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "canon", id: "new1" },
      other: { kind: "npc", id: "n1", name: "Maera" },
      choice: expect.objectContaining({ key: "about", subjectIsFrom: true }),
    }));
    expect(mocks.push).toHaveBeenCalledWith({ path: "/canon", query: { entry: "new1" } });
  });

  // Bug: a failed tie lost the new entry (no navigation, no word), leaving an orphan the DM never finds.
  it("still lands on the entry when the tie fails, and says so", async () => {
    mocks.createEntry.mockResolvedValue({ id: "new1" });
    mocks.connect.mockRejectedValue(new Error("nope"));
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith({ path: "/canon", query: { entry: "new1" } }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("not tied to Maera"));
  });

  // Bug: a failed create navigated to a lore entry that does not exist.
  it("does not navigate when the entry could not be made", async () => {
    mocks.createEntry.mockRejectedValue(new Error("no"));
    await mountIt().get("[data-testid=write-lore]").trigger("click");
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
