import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveCampaignHits } from "./campaignRetrieval.ts";

type Rpc = (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };

function fakeAdmin(rpc: Rpc, enabled: string[] = []) {
  const called: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => { called.push({ name, args }); return Promise.resolve(rpc(name, args)); },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: enabled.map((source_slug) => ({ source_slug })), error: null }) }) }),
  } as unknown as SupabaseClient;
  return { admin, called };
}

const input = { campaignId: "c1", ownerId: "u1", gameSystem: "dnd5e-2024", vector: "[0.1]", model: "m" };

describe("retrieveCampaignHits", () => {
  it("asks for every part of the DM's own canon, secrets included: the DM is the reader", async () => {
    const { admin, called } = fakeAdmin(() => ({ data: [], error: null }));
    await retrieveCampaignHits(admin, input);
    const canon = called.find((c) => c.name === "match_campaign_canon")!;
    expect((canon.args.p_parts as string[]).length).toBeGreaterThan(1);
    expect(canon.args.p_campaign_id).toBe("c1");
  });

  it("never reads a player-authored table: there is no match call for notes of a player or journals", async () => {
    const { admin, called } = fakeAdmin(() => ({ data: [], error: null }));
    await retrieveCampaignHits(admin, input);
    expect(called.map((c) => c.name).filter((n) => /journal|player_note|entity_notes/.test(n))).toEqual([]);
  });

  it("never calls a library side with no enabled source, which would loosen the predicate", async () => {
    const none = fakeAdmin(() => ({ data: [], error: null }), []);
    await retrieveCampaignHits(none.admin, input);
    expect(none.called.some((c) => c.name.startsWith("match_library_"))).toBe(false);
    const some = fakeAdmin(() => ({ data: [], error: null }), ["srd-2024"]);
    await retrieveCampaignHits(some.admin, input);
    expect(some.called.some((c) => c.name === "match_library_monsters")).toBe(true);
  });

  it("skips the monster and library reads for a system with no 5e edition", async () => {
    const { admin, called } = fakeAdmin(() => ({ data: [], error: null }), ["srd-2024"]);
    await retrieveCampaignHits(admin, { ...input, gameSystem: "generic" });
    expect(called.some((c) => c.name === "match_custom_monsters" || c.name.startsWith("match_library_"))).toBe(false);
  });

  it("ranks the hits and says allFailed only when every call failed, which is not the same as finding nothing", async () => {
    const hits = fakeAdmin((name) => name === "match_campaign_npcs" ? { data: [{ id: "n1", name: "Harl", occupation: "miller", distance: 0.5 }], error: null } : { data: [], error: null });
    const found = await retrieveCampaignHits(hits.admin, input);
    expect(found).toMatchObject({ allFailed: false, ranked: [{ kind: "npc", id: "n1", name: "Harl", descriptor: "miller" }] });
    const quiet = (await import("vitest")).vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = fakeAdmin(() => ({ data: null, error: { message: "down" } }));
    expect((await retrieveCampaignHits(broken.admin, input)).allFailed).toBe(true);
    quiet.mockRestore();
  });
});
