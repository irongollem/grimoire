import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEncounterAsDm } from "./fightAccess";

// A table of rows read through `.from(t).select().eq(c, v)....maybeSingle()`, the only shape the loader uses.
type Rows = Record<string, Record<string, unknown>[]>;
function fakeAdmin(tables: Rows): SupabaseClient {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find((row) => filters.every(([c, v]) => row[c] === v)) ?? null,
          error: null,
        }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

// Campaign c1 is owned by "owner". "dm2" is a member with the dm role, "pl" a member with the player role.
const TABLES: Rows = {
  encounters: [{ id: "enc", campaign_id: "c1" }, { id: "orphan", campaign_id: null }],
  campaigns: [{ id: "c1", user_id: "owner", game_system: "dnd5e-2014" }],
  campaign_members: [
    { campaign_id: "c1", user_id: "dm2", role: "dm" },
    { campaign_id: "c1", user_id: "pl", role: "player" },
  ],
};
const load = (userId: string, encounterId = "enc") => loadEncounterAsDm<{ campaign_id: string | null }>(fakeAdmin(TABLES), userId, encounterId, "id, campaign_id");

describe("loadEncounterAsDm", () => {
  it("admits the campaign's owner and a member with the dm role", async () => {
    expect(await load("owner")).toMatchObject({ ok: true });
    expect(await load("dm2")).toMatchObject({ ok: true });
  });

  it("refuses a player member of the campaign with 403, so a player never reads a monster's options", async () => {
    const r = await load("pl");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("refuses someone who is not in the campaign at all with 403", async () => {
    const r = await load("stranger");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("answers 404 for an encounter that does not exist or belongs to no campaign", async () => {
    for (const id of ["nope", "orphan"]) {
      const r = await load("owner", id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(404);
    }
  });
});
