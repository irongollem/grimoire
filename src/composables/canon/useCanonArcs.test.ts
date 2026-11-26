import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import { createCanonArc, updateCanonArc } from "./useCanonArcs";
import { fetchCanonArcs } from "@/lib/canon/canonCampaignReads";

const arc = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "a1", user_id: "dm-1", campaign_id: "c1", name: "The drowned god", summary: null, sort_order: 0,
  created_at: "2026-11-23T10:00:00Z", updated_at: "2026-11-23T10:00:00Z", ...over,
});

describe("canon arcs", () => {
  beforeEach(() => fake.reset());

  // Bug caught: the read left to RLS, so a DM of two campaigns sees one campaign's arcs in the other's picker.
  it("reads only the asked campaign's arcs, in the DM's order", async () => {
    fake.seed("canon_arcs", [arc({ id: "late", sort_order: 1 }), arc({ id: "early", sort_order: 0 }), arc({ id: "other", campaign_id: "c2" })]);
    expect((await fetchCanonArcs("c1")).map((a) => a.id)).toEqual(["early", "late"]);
  });

  // Bug caught: `const { data }` alone, so a failed read looked like "no arcs" and the picker quietly vanished.
  it("throws the read's error instead of showing no arcs", async () => {
    fake.failNext("canon_arcs", { message: "boom" });
    await expect(fetchCanonArcs("c1")).rejects.toMatchObject({ message: "boom" });
  });

  it("stamps the signed-in user and the campaign on a new arc", async () => {
    await createCanonArc("c1", { name: "The drowned god", summary: "What lies under the mill." });
    expect(fake.rows("canon_arcs")).toMatchObject([{ user_id: "dm-1", campaign_id: "c1", name: "The drowned god", summary: "What lies under the mill." }]);
  });

  // Bug caught: RLS refusing a write with no error, which the DM would read as a saved rename.
  it("says so when a write changed no row", async () => {
    await expect(updateCanonArc("missing", { name: "x" })).rejects.toThrow("gone");
  });
});
