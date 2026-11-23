import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

const { readLinkNames } = await import("./askLinkRecords");
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";

beforeEach(() => fake.reset());

describe("readLinkNames", () => {
  // Bug caught: a record of another campaign named by the model was tied (RLS is a ceiling, not a filter).
  it("finds a record only in the campaign the run is in, so another campaign's id is simply not found", async () => {
    fake.seed("deities", [{ id: A, campaign_id: "c1", name: "Auril" }, { id: B, campaign_id: "c2", name: "Elsewhere" }]);
    const names = await readLinkNames("c1", [{ kind: "deity", id: A, relation: "worships" }, { kind: "deity", id: B, relation: "worships" }]);
    expect([...names]).toEqual([[`deity:${A}`, "Auril"]]);
  });

  it.each([
    ["npc", "npcs", "name"], ["party_member", "party_members", "name"], ["faction", "factions", "name"], ["location", "locations", "name"],
    ["item", "items", "name"], ["canon", "canon_entries", "title"],
  ] as const)("scopes a %s to the campaign too", async (kind, table, column) => {
    fake.seed(table, [{ id: A, campaign_id: "c2", [column]: "Elsewhere" }]);
    expect((await readLinkNames("c1", [{ kind, id: A, relation: "seeks" }])).size).toBe(0);
  });

  it("reads a canon entry by its title", async () => {
    fake.seed("canon_entries", [{ id: A, campaign_id: "c1", title: "The Long Winter" }]);
    expect((await readLinkNames("c1", [{ kind: "canon", id: A, relation: "seeks" }])).get(`canon:${A}`)).toBe("The Long Winter");
  });

  // Bug caught: a failed read became "no such record" and the ties vanished without a word.
  it("throws a failed read instead of reporting the records as missing", async () => {
    fake.failNext("deities", { message: "boom" });
    await expect(readLinkNames("c1", [{ kind: "deity", id: A, relation: "worships" }])).rejects.toThrow("boom");
  });
});
