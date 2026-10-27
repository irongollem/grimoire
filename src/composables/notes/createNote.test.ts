import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { createNote } from "./useNotes";
import { noteInsertFromSeed } from "@/lib/downtime/downtimeSeedReward";

const seed = {
  ...noteInsertFromSeed({ title: "Rumour", body: "A whisper.", category: "lore", tags: [] }),
  id: "n1",
  campaign_id: "c1",
};

describe("createNote", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "dm-1" };
  });

  it("stamps the signed-in user, so a seed note (which carries no user_id) can be inserted", async () => {
    await createNote(seed);
    expect(fake.rows("notes")).toMatchObject([{ user_id: "dm-1", campaign_id: "c1", title: "Rumour" }]);
  });

  it("writes nothing when nobody is signed in", async () => {
    session.user = null;
    await expect(createNote(seed)).rejects.toThrow("Not authenticated");
    expect(fake.rows("notes")).toEqual([]);
  });

  it("raises the database's error rather than returning no note", async () => {
    fake.failNext("notes", { message: "boom" });
    await expect(createNote(seed)).rejects.toMatchObject({ message: "boom" });
  });
});
