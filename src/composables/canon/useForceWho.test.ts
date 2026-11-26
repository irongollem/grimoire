import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Connection } from "@/types/connections.types";

const m = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
const rows = ref<Connection[]>([]);
vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: () => ({ data: rows }),
  useCreateConnection: () => ({ mutateAsync: m.create }),
  useRemoveConnection: () => ({ mutateAsync: m.remove }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), fromError: (e: Error) => e.message } }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([]) }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@tanstack/vue-query", () => ({ useQuery: () => ({ data: ref([]) }) }));

import { useForceWhoTies } from "./useForceWho";

const tie = (over: Partial<Connection>): Connection => ({
  source: "link", row_id: "r1", type: "about", outward: true, other_kind: "npc", other_id: "n1", other_name: "Vexa", other_image: null,
  note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
});

beforeEach(() => { rows.value = []; m.create.mockReset(); m.remove.mockReset(); });

describe("useForceWhoTies", () => {
  // Bug caught: another tie of the force (a place it took place at, a known_to) listed as its who and offered for removal.
  it("lists only the about ties to a person, faction or god", () => {
    rows.value = [tie({}), tie({ row_id: "r2", other_kind: "location" }), tie({ row_id: "r3", type: "known_to" })];
    expect(useForceWhoTies("f1").ties.value.map((c) => c.row_id)).toEqual(["r1"]);
  });

  // Bug caught: the who tied with the wrong type or direction (the force would be "told of in" the person).
  it("writes an `about` link from the force to the one named", async () => {
    await useForceWhoTies("f1").addWho({ kind: "deity", id: "d1", name: "Orrin" });
    const input = m.create.mock.calls[0]![0];
    expect(input.subject).toEqual({ kind: "canon", id: "f1" });
    expect(input.other).toEqual({ kind: "deity", id: "d1", name: "Orrin" });
    expect(input.choice).toMatchObject({ key: "about", subjectIsFrom: true });
  });

  // Bug caught: a double pick writing the same tie twice.
  it("does not write a tie that is already there", async () => {
    rows.value = [tie({})];
    await useForceWhoTies("f1").addWho({ kind: "npc", id: "n1", name: "Vexa" });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("removes the tie it is given, from the force", async () => {
    rows.value = [tie({})];
    const w = useForceWhoTies("f1");
    await w.removeWho(w.ties.value[0]!);
    expect(m.remove).toHaveBeenCalledWith({ connection: rows.value[0], subject: { kind: "canon", id: "f1" } });
  });
});
