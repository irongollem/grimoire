import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { SecretBeat } from "@/composables/canon/useSecretBeats";
import type { CanonClue, CanonEntryQuest } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const tied = ref<SecretBeat[]>([]);
const clueBeats = ref<SecretBeat[]>([]);
const links = ref<CanonEntryQuest[]>([]);
const asked = vi.hoisted(() => ({ clueBeatIds: [] as string[][] }));

vi.mock("@/composables/canon/useSecretBeats", () => ({
  useSecretBeats: () => ({ data: tied }),
  useBeatsByIds: (ids: { value: string[] }) => {
    asked.clueBeatIds.push(ids.value);
    return { data: clueBeats };
  },
}));
vi.mock("@/composables/canon/useEntryQuestLinks", () => ({ useEntryQuestLinks: () => links }));
vi.mock("@/composables/canon/useCanonEntryQuests", () => ({
  useCreateEntryQuests: () => ({ mutate: mocks.create }),
  useDeleteEntryQuest: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([{ id: "q1", title: "The Flooded Mine" }, { id: "q2", title: "Bitter Water" }]) }) }));

import SecretOutlets from "./SecretOutlets.vue";

const entry = canonEntry({ id: "s1", campaign_id: "c1", part: "secret" });
const clue = (over: Partial<CanonClue> = {}): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c1", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});
const link = (over: Partial<CanonEntryQuest> = {}): CanonEntryQuest => ({ id: "l1", user_id: "u", campaign_id: "c1", entry_id: "s1", quest_id: "q1", created_at: "", ...over });
const ComboStub = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div />" };
const mountIt = (clues: CanonClue[] = []) =>
  mount(SecretOutlets, { props: { entry, clues }, global: { stubs: { EntityCombobox: ComboStub, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });

describe("SecretOutlets", () => {
  beforeEach(() => {
    tied.value = [];
    clueBeats.value = [];
    links.value = [];
    asked.clueBeatIds = [];
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  // Bug caught (#1258 item 3, 32c): the beat linked to its quest, not the beat, so the DM landed on the quest and had to hunt for it.
  it("lists a beat tied to the secret under its quest, linking to the beat", () => {
    tied.value = [{ id: "b1", quest_id: "q1", title: "The sealed door" }];
    const w = mountIt();
    const group = w.get("[data-testid=outlet-quest]");
    expect(group.text()).toContain("The Flooded Mine");
    expect(w.get("[data-testid=outlet-beat] a").attributes("href")).toBe("/quests/q1/beats/b1");
  });

  // Bug caught: a clue placed at a beat was dropped from the quest it lies in, or grouped under another quest.
  it("lists a clue placed at a beat under that beat's quest, linking to the beat", () => {
    clueBeats.value = [{ id: "b2", quest_id: "q2", title: "The well" }];
    const w = mountIt([clue({ quest_beat_id: "b2" })]);
    const group = w.get("[data-testid=outlet-quest]");
    expect(group.text()).toContain("Bitter Water");
    expect(group.get("[data-testid=outlet-clue]").text()).toContain("A locket");
    expect(group.get("[data-testid=outlet-clue] a").attributes("href")).toBe("/quests/q2/beats/b2");
    expect(w.find("[data-testid=outlet-planned]").exists()).toBe(false);
  });

  // Bug caught: the beats of the clues were asked for with clues that lie at a place or a person, or not at all.
  it("asks for the beats of exactly the clues placed at a beat", () => {
    mountIt([clue({ quest_beat_id: "b2" }), clue({ id: "k2", location_id: "loc" }), clue({ id: "k3" })]);
    expect(asked.clueBeatIds.at(-1)).toEqual(["b2"]);
  });

  // Bug caught: a quest the DM linked by hand and has built nothing in showed no row, or an empty one with no word on it.
  it("says Planned, no beat yet for a hand-linked quest with no beat or clue", () => {
    links.value = [link()];
    const w = mountIt();
    expect(w.get("[data-testid=outlet-quest]").text()).toContain("The Flooded Mine");
    expect(w.get("[data-testid=outlet-planned]").text()).toBe("Planned, no beat yet");
  });

  // Bug caught: a quest with a real beat also read "Planned, no beat yet" because it was linked by hand too.
  it("does not call a linked quest planned once a beat is tied in it", () => {
    links.value = [link()];
    tied.value = [{ id: "b1", quest_id: "q1", title: "The sealed door" }];
    const w = mountIt();
    expect(w.findAll("[data-testid=outlet-quest]")).toHaveLength(1);
    expect(w.find("[data-testid=outlet-planned]").exists()).toBe(false);
  });

  // Bug caught: only a hand link can be unlinked; a quest that is there only for its beat must not offer an unlink that deletes nothing.
  it("unlinks a hand-linked quest, and offers no unlink for one shown only for its beat", async () => {
    links.value = [link()];
    tied.value = [{ id: "b9", quest_id: "q2", title: "Somewhere else" }];
    const w = mountIt();
    expect(w.findAll("button[aria-label^='Unlink']")).toHaveLength(1);
    await w.get("button[aria-label='Unlink The Flooded Mine']").trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("l1");
  });

  // Bug caught: a quest already in the block offered again, or the picker linking another entry's id.
  it("plans it in a quest not yet shown, linking this secret, and clears the picker", async () => {
    links.value = [link()];
    const w = mountIt();
    expect(w.getComponent(ComboStub).props("options")).toEqual([{ id: "q2", name: "Bitter Water" }]);
    w.getComponent(ComboStub).vm.$emit("update:modelValue", "q2");
    await nextTick();
    expect(mocks.create).toHaveBeenCalledWith([{ campaign_id: "c1", entry_id: "s1", quest_id: "q2" }]);
  });

  it("says nothing brings it out when there is nothing", () => {
    expect(mountIt().find("[data-testid=outlets-empty]").exists()).toBe(true);
  });
});
