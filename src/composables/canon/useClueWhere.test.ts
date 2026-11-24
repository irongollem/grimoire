import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { CanonClue } from "@/types/canon.types";

const places = ref<{ id: string; name: string }[] | undefined>(undefined);
const people = ref<{ id: string; name: string }[] | undefined>(undefined);
const beats = ref<{ id: string; name: string }[] | undefined>(undefined);
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: places }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: people }) }));
vi.mock("@/composables/quests/useBeatOptions", () => ({ useBeatOptions: () => ({ data: beats }) }));
const documents = ref<{ id: string; title: string }[] | undefined>(undefined);
const clues = ref<{ item_id: string | null }[] | undefined>(undefined);
const items = ref(new Map<string, { name: string }>());
const itemsLoading = ref(false);
vi.mock("@/scriptorium/composables/useScriptorium", () => ({ useScriptoriumDocuments: () => ({ data: documents }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: clues }) }));
vi.mock("@/composables/items/useItemsByIds", () => ({ useItemsByIds: () => ({ data: items, isLoading: itemsLoading }) }));

import { useClueWhere } from "./useClueWhere";

const clue = (over: Partial<CanonClue>): CanonClue => ({
  id: "k", user_id: "u", campaign_id: "c", secret_id: "s", title: "t", sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  found_at: null, item_id: null, document_id: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

describe("useClueWhere", () => {
  it("names the place, person and beat a clue lies at", () => {
    places.value = [{ id: "p1", name: "The Sugar Vault" }];
    people.value = [{ id: "n1", name: "Old Marchpane" }];
    beats.value = [{ id: "b1", name: "Quest · The Cold Ovens" }];
    const where = useClueWhere().value;
    expect(where(clue({ location_id: "p1" }))).toEqual({ kind: "location", name: "The Sugar Vault" });
    expect(where(clue({ npc_id: "n1" }))).toEqual({ kind: "npc", name: "Old Marchpane" });
    expect(where(clue({ quest_beat_id: "b1" }))).toEqual({ kind: "quest_beat", name: "Quest · The Cold Ovens" });
  });

  it("is null for a clue lying nowhere yet", () => {
    places.value = [];
    expect(useClueWhere().value(clue({}))).toBeNull();
  });

  it("gives no name while the lookup loads, so a loading row never shows a name that is not its own", () => {
    places.value = undefined;
    expect(useClueWhere().value(clue({ location_id: "p1" }))).toEqual({ kind: "location", name: null });
  });

  it("falls back to 'gone' wording only once the lookup has loaded without the id", () => {
    places.value = [{ id: "other", name: "Elsewhere" }];
    expect(useClueWhere().value(clue({ location_id: "p1" }))).toEqual({ kind: "location", name: "A place that is gone" });
  });

  // Bug: a clue in an item showed no name (or "nowhere"), because the lookup knew only places, people and beats.
  it("names the item and the handout a clue lies in", () => {
    clues.value = [{ item_id: "i1" }];
    items.value = new Map([["i1", { name: "The Marchpane Locket" }]]);
    documents.value = [{ id: "d1", title: "A torn letter" }];
    const where = useClueWhere().value;
    expect(where(clue({ item_id: "i1" }))).toEqual({ kind: "item", name: "The Marchpane Locket" });
    expect(where(clue({ document_id: "d1" }))).toEqual({ kind: "document", name: "A torn letter" });
  });

  // Bug: a clue in an item whose row had not loaded read "An item that is gone" for a moment, saying it was deleted.
  it("gives no item name while the items load, and 'gone' wording only once they have", () => {
    clues.value = [{ item_id: "i1" }];
    itemsLoading.value = true;
    expect(useClueWhere().value(clue({ item_id: "i1" }))).toEqual({ kind: "item", name: null });
    itemsLoading.value = false;
    items.value = new Map();
    expect(useClueWhere().value(clue({ item_id: "i1" }))).toEqual({ kind: "item", name: "An item that is gone" });
  });
});
