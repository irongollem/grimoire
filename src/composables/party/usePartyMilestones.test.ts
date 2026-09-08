import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(), del: vi.fn(),
  select: vi.fn(), eq: vi.fn(), single: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
  getCurrentUser: () => ({ id: "dm-1" }),
}));

import { createPartyMilestone, deletePartyMilestone } from "./usePartyMilestones";

describe("createPartyMilestone", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it("stamps the current user as created_by when none is given", async () => {
    mocks.single.mockResolvedValue({ data: { id: "milestone-1" }, error: null });
    await createPartyMilestone({ campaign_id: "c1", quest_id: null, text: "Renown among the dockworkers", source_event_id: null });
    expect(mocks.from).toHaveBeenCalledWith("party_milestones");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ text: "Renown among the dockworkers", created_by: "dm-1" }));
  });

  it("keeps an explicit created_by rather than overwriting it", async () => {
    mocks.single.mockResolvedValue({ data: { id: "milestone-1" }, error: null });
    await createPartyMilestone({ campaign_id: "c1", quest_id: null, text: "x", source_event_id: null, created_by: "other-user" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: "other-user" }));
  });

  it("surfaces an insert failure", async () => {
    const error = new Error("insert failed");
    mocks.single.mockResolvedValue({ data: null, error });
    await expect(createPartyMilestone({ campaign_id: "c1", quest_id: null, text: "x", source_event_id: null }))
      .rejects.toBe(error);
  });
});

describe("deletePartyMilestone", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ delete: mocks.del });
    mocks.del.mockReturnValue({ eq: mocks.eq });
  });

  it("deletes the row by id", async () => {
    mocks.eq.mockResolvedValue({ error: null });
    await deletePartyMilestone("milestone-1");
    expect(mocks.from).toHaveBeenCalledWith("party_milestones");
    expect(mocks.eq).toHaveBeenCalledWith("id", "milestone-1");
  });

  it("surfaces a delete failure", async () => {
    const error = new Error("delete failed");
    mocks.eq.mockResolvedValue({ error });
    await expect(deletePartyMilestone("milestone-1")).rejects.toBe(error);
  });
});
