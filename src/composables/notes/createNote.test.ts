import { describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "dm-1" }),
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "n1", ...row }, error: null }) }) };
      },
    }),
  },
}));

import { createNote } from "./useNotes";
import { noteInsertFromSeed } from "@/lib/downtime/downtimeSeedReward";

describe("createNote", () => {
  it("stamps the signed-in user, so a seed note (which carries no user_id) can be inserted", async () => {
    await createNote({
      ...noteInsertFromSeed({ title: "Rumour", body: "A whisper.", category: "lore", tags: [] }),
      campaign_id: "c1",
    });
    expect(inserted[0]).toMatchObject({ user_id: "dm-1", campaign_id: "c1", title: "Rumour" });
  });
});
