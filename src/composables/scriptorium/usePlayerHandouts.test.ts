import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { fetchHandout, fetchHandouts } from "./usePlayerHandouts";
import { PLAYER_HANDOUTS_KEY } from "@/lib/campaignLiveSync/registry";

/** A chainable builder that records every filter and resolves at the end. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "contains", "order"]) {
    chain[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, args]);
      return name === "order" ? Promise.resolve(result) : chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  mocks.from.mockReturnValue(chain);
  return calls;
}

beforeEach(() => mocks.from.mockReset());

describe("fetchHandouts", () => {
  it("scopes to the campaign and the recipient in the query itself", async () => {
    const calls = builder({ data: [{ id: "d1" }], error: null });
    expect(await fetchHandouts("c1", "pm1")).toEqual([{ id: "d1" }]);
    expect(mocks.from).toHaveBeenCalledWith("scriptorium_documents");
    expect(calls).toContainEqual(["eq", ["campaign_id", "c1"]]);
    expect(calls).toContainEqual(["contains", ["player_visible_to", ["pm1"]]]);
    expect(calls).toContainEqual(["order", ["updated_at", { ascending: false }]]);
  });

  it("never selects the body", async () => {
    const calls = builder({ data: [], error: null });
    await fetchHandouts("c1", "pm1");
    const select = calls.find(([name]) => name === "select");
    expect(String(select?.[1][0])).not.toContain("content");
  });

  it("throws the error rather than reporting an empty list", async () => {
    builder({ data: null, error: new Error("boom") });
    await expect(fetchHandouts("c1", "pm1")).rejects.toThrow("boom");
  });
});

describe("fetchHandout", () => {
  it("reads the readable columns of one row, scoped by id, campaign and recipient", async () => {
    const calls = builder({ data: { id: "d1", content: "{}" }, error: null });
    expect(await fetchHandout("d1", "c1", "pm1")).toEqual({ id: "d1", content: "{}" });
    // Never `*`: the DM's tags, AI provenance and owner id ride on the same row.
    const select = calls.find(([method]) => method === "select");
    expect(select?.[1][0]).toBe("id, title, content, doc_type, campaign_id, theme, updated_at");
    expect(calls).toContainEqual(["eq", ["id", "d1"]]);
    expect(calls).toContainEqual(["eq", ["campaign_id", "c1"]]);
    expect(calls).toContainEqual(["contains", ["player_visible_to", ["pm1"]]]);
  });

  it("returns null for a withdrawn handout", async () => {
    builder({ data: null, error: null });
    expect(await fetchHandout("d1", "c1", "pm1")).toBeNull();
  });

  it("throws a real error", async () => {
    builder({ data: null, error: new Error("nope") });
    await expect(fetchHandout("d1", "c1", "pm1")).rejects.toThrow("nope");
  });
});

it("keeps the live-sync query-key root", () => {
  expect(PLAYER_HANDOUTS_KEY).toBe("player-handouts");
});
