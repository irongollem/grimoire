import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { setQuestBeatAttachmentRequired } from "./useQuestFlow";

beforeEach(() => fake.reset());

describe("setQuestBeatAttachmentRequired", () => {
  it("changes only the one placement's requirement", async () => {
    fake.seed("quest_beat_attachments", [
      { id: "placement-1", is_required: true, note: "keep" },
      { id: "placement-2", is_required: true, note: "other" },
    ]);
    await expect(setQuestBeatAttachmentRequired("placement-1", false)).resolves.toMatchObject({
      id: "placement-1",
      is_required: false,
      note: "keep",
    });
    expect(fake.rows("quest_beat_attachments")).toEqual([
      { id: "placement-1", is_required: false, note: "keep" },
      { id: "placement-2", is_required: true, note: "other" },
    ]);
  });

  it("does not pretend an inaccessible or removed placement saved", async () => {
    await expect(setQuestBeatAttachmentRequired("missing", true)).rejects.toThrow("no longer available");
  });
});
