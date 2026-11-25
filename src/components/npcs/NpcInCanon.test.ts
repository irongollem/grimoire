import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { CanonHereLore } from "@/composables/canon/useCanonHere";

const mocks = vi.hoisted(() => ({ createEntry: vi.fn(), connect: vi.fn(), push: vi.fn(), toastError: vi.fn() }));
// Which lore is about this person, and the told counts, are `get_canon_here`'s (canon_story_shape.test.sql).
const lore = ref<CanonHereLore[]>([]);

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }), RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : "?") } }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }) }));
vi.mock("@/composables/canon/useCanonHere", () => ({ useCanonHere: () => ({ data: computed(() => ({ clues: [], passages: [], lore: lore.value })) }) }));

import NpcToldOf from "./NpcToldOf.vue";

const mountIt = () => mount(NpcToldOf, { props: { npcId: "n1", name: "Maera" }, global: { stubs: { AppButton: { props: ["label"], emits: ["click"], template: "<button @click=\"$emit('click')\">{{ label }}</button>" } } } });

describe("NpcToldOf", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    lore.value = [];
  });

  // Bug: the block showed no count of what is told, or did not link the entry.
  it("lists the lore told of this person, each with how many passages are told", () => {
    lore.value = [{ id: "l1", title: "The Fall of the Mere", told: 2, total: 3 }];
    const rows = mountIt().findAll("[data-testid=npc-lore-row]");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.get("[data-testid=npc-lore-told]").text()).toBe("2 of 3 told");
    expect(rows[0]!.get("a").attributes("href")).toBe("l1");
  });

  it("says so when no lore is told of them", () => {
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
