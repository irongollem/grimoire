import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertAgentSession } from "./session.ts";

function adminRecording(insert: (row: Record<string, unknown>) => void, error: unknown = null) {
  const chain = {
    insert: (row: Record<string, unknown>) => { insert(row); return chain; },
    select: () => chain,
    single: async () => ({ data: error ? null : { id: "s-1" }, error }),
  };
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

const input = { userId: "u", campaignId: "c", provider: "openai", model: "m1", columns: "id" };

describe("insertAgentSession", () => {
  it("writes the kind it was given, and a column named in `extra` can never override it", async () => {
    const rows: Record<string, unknown>[] = [];
    await insertAgentSession(adminRecording((r) => rows.push(r)), { ...input, kind: "ask", extra: { kind: "solo_table", scene_location_id: "p" } });
    expect(rows[0]).toMatchObject({ kind: "ask", user_id: "u", campaign_id: "c", scene_location_id: "p" });
  });

  it("throws the database's error rather than answering a row that was not made", async () => {
    await expect(insertAgentSession(adminRecording(() => undefined, new Error("denied")), { ...input, kind: "ask" })).rejects.toThrow("denied");
  });
});
