import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tableAiEnabled } from "./featureAccess";

/** A service-role client that answers the one read this module makes. */
function adminWith(grants: string[], fails = false) {
  const asked: string[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (_c: string, userId: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              asked.push(userId);
              return fails ? { data: null, error: { message: "down" } } : { data: grants.includes(userId) ? { user_id: userId } : null, error: null };
            },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, asked };
}

// The maintainer, 19 Nov 2026: the table is released "with a flag, so only users that are flagged can see it".
describe("tableAiEnabled", () => {
  it("reports AI off for a campaign whose owner has not been granted the table, whatever the campaign says", async () => {
    const { client } = adminWith(["owner-granted"]);
    expect(await tableAiEnabled(client, { user_id: "owner-granted", ai_enabled: true })).toBe(true); // positive control
    expect(await tableAiEnabled(client, { user_id: "owner-other", ai_enabled: true })).toBe(false);
  });

  it("keeps a campaign's own choice when the owner is granted: off stays off, undecided stays undecided", async () => {
    const { client, asked } = adminWith(["owner"]);
    expect(await tableAiEnabled(client, { user_id: "owner", ai_enabled: false })).toBe(false);
    expect(asked).toEqual([]); // a campaign with AI off is not looked up
    expect(await tableAiEnabled(client, { user_id: "owner", ai_enabled: null })).toBeNull();
  });

  it("is closed when the grant cannot be read", async () => {
    const { client } = adminWith(["owner"], true);
    expect(await tableAiEnabled(client, { user_id: "owner", ai_enabled: true })).toBe(false);
  });
});
