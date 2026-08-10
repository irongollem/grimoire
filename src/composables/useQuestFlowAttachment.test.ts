import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { setQuestBeatAttachmentRequired } from "./useQuestFlow";

describe("setQuestBeatAttachmentRequired", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });

  it("updates only the beat placement requirement", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "placement-1", is_required: false }, error: null });
    await expect(setQuestBeatAttachmentRequired("placement-1", false)).resolves.toEqual({ id: "placement-1", is_required: false });
    expect(mocks.from).toHaveBeenCalledWith("quest_beat_attachments");
    expect(mocks.update).toHaveBeenCalledWith({ is_required: false });
    expect(mocks.eq).toHaveBeenCalledWith("id", "placement-1");
  });

  it("does not pretend an inaccessible or removed placement saved", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(setQuestBeatAttachmentRequired("missing", true)).rejects.toThrow("no longer available");
  });
});
