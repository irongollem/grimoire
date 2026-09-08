import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(), update: vi.fn(), del: vi.fn(),
  select: vi.fn(), eq: vi.fn(), single: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
  getCurrentUser: () => ({ id: "dm-1" }),
}));

import { createNpcFavor, deleteNpcFavor, settleNpcFavor } from "./useNpcFavors";

describe("createNpcFavor", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it("stamps the current user as created_by when none is given", async () => {
    mocks.single.mockResolvedValue({ data: { id: "favor-1" }, error: null });
    await createNpcFavor({ campaign_id: "c1", npc_id: "npc-1", quest_id: null, text: "A debt of honor", source_event_id: null });
    expect(mocks.from).toHaveBeenCalledWith("npc_favors");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ text: "A debt of honor", created_by: "dm-1" }));
  });

  it("keeps an explicit created_by rather than overwriting it", async () => {
    mocks.single.mockResolvedValue({ data: { id: "favor-1" }, error: null });
    await createNpcFavor({ campaign_id: "c1", npc_id: "npc-1", quest_id: null, text: "x", source_event_id: null, created_by: "other-user" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: "other-user" }));
  });

  it("surfaces an insert failure", async () => {
    const error = new Error("insert failed");
    mocks.single.mockResolvedValue({ data: null, error });
    await expect(createNpcFavor({ campaign_id: "c1", npc_id: "npc-1", quest_id: null, text: "x", source_event_id: null }))
      .rejects.toBe(error);
  });
});

describe("settleNpcFavor", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it("stamps settled_at rather than deleting the row", async () => {
    mocks.single.mockResolvedValue({ data: { id: "favor-1", settled_at: "now" }, error: null });
    await settleNpcFavor("favor-1");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ settled_at: expect.any(String) }));
    expect(mocks.eq).toHaveBeenCalledWith("id", "favor-1");
  });
});

describe("deleteNpcFavor", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ delete: mocks.del });
    mocks.del.mockReturnValue({ eq: mocks.eq });
  });

  it("deletes the row by id", async () => {
    mocks.eq.mockResolvedValue({ error: null });
    await deleteNpcFavor("favor-1");
    expect(mocks.from).toHaveBeenCalledWith("npc_favors");
    expect(mocks.eq).toHaveBeenCalledWith("id", "favor-1");
  });

  it("surfaces a delete failure", async () => {
    const error = new Error("delete failed");
    mocks.eq.mockResolvedValue({ error });
    await expect(deleteNpcFavor("favor-1")).rejects.toBe(error);
  });
});
