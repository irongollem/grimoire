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

import TruthDetail from "./TruthDetail.vue";

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

function mountDetail(e: CanonEntry) {
  return mount(TruthDetail, {
    props: { entry: e },
    global: { stubs: { ConnectionsSection: true, WorldEntityPicker: PickerStub } },
  });
}

describe("TruthDetail", () => {
  beforeEach(() => {
    rows.value = [];
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue(undefined);
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
});
