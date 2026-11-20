import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { decideInvention, loadPendingInventions } from "./inventionIo";

const C = "c1";
const MEMBER = "m1";

const draft = (name: string) => ({
  item: { ref: { item_id: "i1" }, new: null, name, rarity: "common", item_type: "gear", value_cp: 50 },
  mechanics: [], quantity: 1, ingredients: [], warnings: [],
});
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, campaign_id: C, party_member_id: MEMBER, status: "pending", discipline: "tinkering", draft: draft(`Item ${id}`), created_at: "2026-11-18T10:00:00Z", ...over,
});
const run = (fake: ReturnType<typeof createSupabaseFake>, campaign = C, member = MEMBER) =>
  loadPendingInventions(fake.client as unknown as SupabaseClient, campaign, member);

describe("loadPendingInventions", () => {
  // Bug caught: the read had no campaign filter (the owner's RLS also shows their inventions elsewhere), no character
  // filter, or no status filter, so the Narrator ruled on an approved one, another campaign's or another character's.
  it("returns only this campaign's pending inventions of the played character", async () => {
    const fake = createSupabaseFake();
    fake.seed("crafting_inventions", [
      row("mine"),
      row("other-campaign", { campaign_id: "c2" }),
      row("other-member", { party_member_id: "m2" }),
      row("approved", { status: "approved" }),
      row("revising", { status: "draft" }),
    ]);
    const found = await run(fake);
    expect(found.map((p) => p.id)).toEqual(["mine"]);
    expect(found[0]).toMatchObject({ name: "Item mine", discipline: "tinkering", createdAt: "2026-11-18T10:00:00Z" });
  });

  // Bug caught: the newest three shown, so the oldest waited for ever.
  it("returns the oldest three first", async () => {
    const fake = createSupabaseFake();
    fake.seed("crafting_inventions", [
      row("d", { created_at: "2026-11-19T10:00:00Z" }), row("b", { created_at: "2026-11-17T10:00:00Z" }),
      row("c", { created_at: "2026-11-18T10:00:00Z" }), row("a", { created_at: "2026-11-16T10:00:00Z" }),
    ]);
    expect((await run(fake)).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  // Bug caught: a failed read answered as "nothing waiting", which is indistinguishable from a real absence.
  it("fails on a database error and on a draft it does not understand", async () => {
    const failing = createSupabaseFake();
    failing.failNext("crafting_inventions", { message: "db down" });
    await expect(run(failing)).rejects.toThrow("db down");
    const odd = createSupabaseFake();
    odd.seed("crafting_inventions", [row("x", { draft: { nope: true } })]);
    await expect(run(odd)).rejects.toThrow();
  });
});

describe("decideInvention", () => {
  const ruling = (over: Record<string, unknown> = {}) => ({ inventionId: "i1", decision: "approve" as const, note: null, name: "Lamp", ...over });

  // Bug caught: the decision sent under another parameter name, or a note sent with an approval.
  it("calls decide_crafting_invention with the id and decision, and a note only for a return", async () => {
    const fake = createSupabaseFake();
    fake.onRpc("decide_crafting_invention", () => ({ status: "approved" }));
    await decideInvention(fake.client as unknown as SupabaseClient, ruling());
    await decideInvention(fake.client as unknown as SupabaseClient, ruling({ decision: "return", note: "Too bright." }));
    expect(fake.calls.map((c) => c.payload)).toEqual([
      { p_invention_id: "i1", p_decision: "approve" },
      { p_invention_id: "i1", p_decision: "return", p_note: "Too bright." },
    ]);
  });

  // Bug caught: a refused ruling (not a DM, no longer pending) swallowed, so the turn reported a decision never made.
  it("throws what the database refuses", async () => {
    const fake = createSupabaseFake();
    fake.failNext("decide_crafting_invention", { message: "Not authorized", code: "42501" });
    await expect(decideInvention(fake.client as unknown as SupabaseClient, ruling())).rejects.toMatchObject({ message: "Not authorized" });
  });
});
