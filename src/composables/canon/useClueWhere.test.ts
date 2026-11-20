import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { CanonClue } from "@/types/canon.types";

const places = ref<{ id: string; name: string }[] | undefined>(undefined);
const people = ref<{ id: string; name: string }[] | undefined>(undefined);
const beats = ref<{ id: string; name: string }[] | undefined>(undefined);
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: places }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: people }) }));
vi.mock("@/composables/quests/useBeatOptions", () => ({ useBeatOptions: () => ({ data: beats }) }));

import { useClueWhere } from "./useClueWhere";

const clue = (over: Partial<CanonClue>): CanonClue => ({
  id: "k", user_id: "u", campaign_id: "c", secret_id: "s", title: "t", sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
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
});
