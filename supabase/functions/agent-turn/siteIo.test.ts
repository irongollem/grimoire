import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { loadSiteState } from "./siteIo";

const C = "c1";
const OTHER_C = "c2";

const state = (location_id: string, fact: string, value: boolean, door_id: string | null = null) => ({ location_id, fact, value, door_id });

function world() {
  const fake = createSupabaseFake();
  fake.seed("locations", [
    { id: "crypt", campaign_id: C, name: "Crypt", parent_id: null },
    { id: "ossuary", campaign_id: C, name: "Ossuary", parent_id: "crypt" },
    { id: "nave", campaign_id: C, name: "Nave", parent_id: "crypt" },
    { id: "far", campaign_id: C, name: "Far Tower", parent_id: null },
    { id: "foreign", campaign_id: OTHER_C, name: "Foreign Crypt", parent_id: null },
    { id: "foreign-room", campaign_id: OTHER_C, name: "Foreign Room", parent_id: "crypt" },
  ]);
  fake.seed("location_doors", [
    { id: "d-iron", label: "iron door" },
    { id: "d-other", label: "elsewhere door" },
  ]);
  return fake;
}

const run = (fake: ReturnType<typeof createSupabaseFake>, location: string, campaign = C) =>
  loadSiteState(fake.client as unknown as SupabaseClient, campaign, location);

describe("loadSiteState", () => {
  it("collects what is true of the place, its rooms and its doors, the place first", async () => {
    const fake = world();
    fake.seed("location_state", [
      state("crypt", "explored", true),
      state("ossuary", "cleared", true),
      state("ossuary", "looted", true),
      state("crypt", "unlocked", true, "d-iron"),
    ]);
    expect(await run(fake, "crypt")).toEqual({
      places: [{ name: "Crypt", facts: ["explored"] }, { name: "Ossuary", facts: ["cleared", "looted"] }],
      doors: [{ label: "iron door", facts: ["unlocked"] }],
    });
  });

  // Bug caught: a fact taken back (value false, the undo) was told as true.
  it("leaves out a fact that was taken back", async () => {
    const fake = world();
    fake.seed("location_state", [state("crypt", "cleared", false), state("crypt", "explored", true)]);
    expect((await run(fake, "crypt")).places).toEqual([{ name: "Crypt", facts: ["explored"] }]);
  });

  // Bug caught: the view has no campaign column, so a place of another campaign (or one beside the party's) leaked in.
  it("reads nothing for a place of another campaign, and nothing of a room that is neither the place nor inside it", async () => {
    const fake = world();
    fake.seed("location_state", [state("foreign", "cleared", true), state("far", "looted", true), state("foreign-room", "looted", true)]);
    expect(await run(fake, "foreign")).toEqual({ places: [], doors: [] });
    expect(await run(fake, "crypt")).toEqual({ places: [], doors: [] });
  });

  // Bug caught: standing in a room, the site's doors (logged against the site) were never told.
  it("tells the doors of the site when the party stands in a room of it, but not the site's own facts", async () => {
    const fake = world();
    fake.seed("location_state", [state("crypt", "unlocked", true, "d-iron"), state("crypt", "looted", true), state("ossuary", "found", true, "d-other")]);
    expect(await run(fake, "ossuary")).toEqual({ places: [], doors: [{ label: "iron door", facts: ["unlocked"] }] });
  });

  it("fails the read on a database error, so the turn runs without the section", async () => {
    const fake = world();
    fake.failNext("location_state", { message: "db down" });
    await expect(run(fake, "crypt")).rejects.toThrow("db down");
  });
});
