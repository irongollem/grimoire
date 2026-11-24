import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "dm-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { createEntryQuests, deleteEntryQuest, fetchCanonEntryQuests } from "./useCanonEntryQuests";

describe("canon entry quests", () => {
  beforeEach(() => {
    fake.reset();
    session.user = { id: "dm-1" };
  });

  // Bug caught: a link written under the old `force_id` column, which the renamed table no longer has.
  it("writes a link under entry_id, stamped with the signed-in user", async () => {
    await createEntryQuests([{ campaign_id: "c1", entry_id: "s1", quest_id: "q1" }]);
    expect(fake.rows("canon_entry_quests")).toMatchObject([{ user_id: "dm-1", campaign_id: "c1", entry_id: "s1", quest_id: "q1" }]);
  });

  // Bug caught: a second tab adding the same quest overwrote the first link, or threw on the unique index.
  it("links a quest once and leaves the first link as it was, so adding it again from a second tab changes nothing", async () => {
    fake.seed("canon_entry_quests", [{ id: "first", user_id: "someone-else", campaign_id: "c1", entry_id: "f1", quest_id: "q1" }]);
    await createEntryQuests([{ campaign_id: "c1", entry_id: "f1", quest_id: "q1" }, { campaign_id: "c1", entry_id: "f1", quest_id: "q2" }]);
    expect(fake.rows("canon_entry_quests")).toMatchObject([{ id: "first", user_id: "someone-else", quest_id: "q1" }, { entry_id: "f1", quest_id: "q2" }]);
  });

  // Bug caught: a read with no campaign filter, which shows one campaign's links in another once a wider policy exists.
  it("reads only the asked campaign's links, and throws a read error instead of showing none", async () => {
    fake.seed("canon_entry_quests", [{ id: "mine", campaign_id: "c1", entry_id: "f1", quest_id: "q1" }, { id: "other", campaign_id: "c2", entry_id: "f1", quest_id: "q1" }]);
    expect((await fetchCanonEntryQuests("c1")).map((l) => l.id)).toEqual(["mine"]);
    fake.failNext("canon_entry_quests", { message: "boom" });
    await expect(fetchCanonEntryQuests("c1")).rejects.toMatchObject({ message: "boom" });
  });

  // Bug caught: an unlink that removed every link of the quest, or of the entry, instead of the one asked.
  it("unlinks by the link's id only", async () => {
    fake.seed("canon_entry_quests", [{ id: "a", campaign_id: "c1", entry_id: "f1", quest_id: "q1" }, { id: "b", campaign_id: "c1", entry_id: "f1", quest_id: "q2" }]);
    await deleteEntryQuest("a");
    expect(fake.rows("canon_entry_quests").map((r) => r.id)).toEqual(["b"]);
  });

  it("writes nothing when signed out", async () => {
    session.user = null;
    await expect(createEntryQuests([{ campaign_id: "c1", entry_id: "s1", quest_id: "q1" }])).rejects.toThrow("Not authenticated");
  });
});
