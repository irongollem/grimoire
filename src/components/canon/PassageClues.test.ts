import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import type { CanonClue, CanonEntry, CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const entries = ref<CanonEntry[]>([]);

vi.mock("@/composables/canon/useCanonClues", () => ({
  useCanonClues: () => ({ data: clues }),
  useCreateCanonClue: () => ({ mutate: mocks.create }),
  useDeleteCanonClue: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));

import PassageClues from "./PassageClues.vue";

const passage: CanonLorePassage = {
  id: "g1", user_id: "u", campaign_id: "c", entry_id: "l1", title: "What was lost", body: null, sort_order: 1, player_visible_to: [], told_at: null,
  told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, author_id: "u", dm_edited_at: null, body_before_dm_edit: null, ai_provenance: null, created_at: "", updated_at: "",
};
const clue = (over: Partial<CanonClue>): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "What was lost", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, item_id: null, document_id: null, found_session_id: null, passage_id: "g1", ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const Combobox = { name: "EntityCombobox", props: ["modelValue", "options"], emits: ["update:modelValue"], template: "<div data-testid='passage-clue-add' />" };
const mountIt = (canAdd = true) =>
  mount(PassageClues, {
    props: { passage, canAdd },
    global: { stubs: { EntityCombobox: Combobox, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } },
  });

describe("PassageClues", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    clues.value = [];
    entries.value = [
      canonEntry({ id: "s1", part: "secret", title: "The Stain is a wound in the dream" }),
      canonEntry({ id: "s2", part: "secret", title: "The bell was sold" }),
      canonEntry({ id: "t1", part: "truth", title: "Salt is money" }),
    ];
  });

  it("names the secrets this passage is a clue to, and no other passage's", () => {
    clues.value = [clue({}), clue({ id: "k2", secret_id: "s2", passage_id: "other" })];
    expect(mountIt().findAll("[data-testid=passage-clue-to]").map((a) => a.text())).toEqual(["The Stain is a wound in the dream"]);
  });

  // Bug caught (#1255 item 5): nothing ever wrote canon_clues.passage_id, so "a clue is written once" could not be done.
  it("files a clue that points at the passage when a secret is chosen, after that secret's other clues", async () => {
    clues.value = [clue({ id: "k9", secret_id: "s2", passage_id: null })];
    const w = mountIt();
    w.findComponent(Combobox).vm.$emit("update:modelValue", "s2");
    await nextTick();
    expect(mocks.create).toHaveBeenCalledWith({ secret_id: "s2", passage_id: "g1", title: "What was lost", sort_order: 1 });
  });

  // Bug caught: a secret already linked was offered again, filing the same clue twice; a truth was offered as a secret.
  it("offers only the secrets it is not yet a clue to", () => {
    clues.value = [clue({})];
    expect(mountIt().findComponent(Combobox).props("options")).toEqual([{ id: "s2", name: "The bell was sold" }]);
  });

  it("removes the clue, not the secret, when unlinked", async () => {
    clues.value = [clue({})];
    await mountIt().find("[data-testid=passage-clue-remove]").trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("k1");
  });

  // Bug caught: a first passage or a player's own passage could be planted as a clue, which telling would never find.
  it("still names its secrets but offers no add or remove where a clue may not be made", () => {
    clues.value = [clue({})];
    const w = mountIt(false);
    expect(w.findAll("[data-testid=passage-clue-to]")).toHaveLength(1);
    expect(w.findComponent(Combobox).exists()).toBe(false);
    expect(w.find("[data-testid=passage-clue-remove]").exists()).toBe(false);
  });
});
