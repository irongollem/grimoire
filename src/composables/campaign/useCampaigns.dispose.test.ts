import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
let rpcError: Error | null = null;
let cleanupError: Error | null = null;
let minisError: Error | null = null;
let voicesError: Error | null = null;
let urlsError: Error | null = null;
let user: { id: string } | null = { id: "me" };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async () => {
      order.push("rpc");
      return { error: rpcError };
    },
  },
  getCurrentUser: () => user,
}));
vi.mock("@/lib/analytics", () => ({ track: () => {} }));
vi.mock("@/lib/campaign/campaignFiles", () => ({
  campaignFileUrls: async () => ["https://cdn/a.webp"],
  campaignImportSourcePaths: async () => ["me/page1.png"],
  deleteCampaignMinis: async () => {
    order.push("minis");
    if (minisError) throw minisError;
  },
  deleteCampaignVoiceClips: async () => {
    order.push("voices");
    if (voicesError) throw voicesError;
  },
  sweepNoteReadings: async (campaignId: string) => {
    order.push(`sweep:${campaignId}`);
  },
  deleteImportSourcePaths: async (paths: string[]) => {
    order.push(`import:${paths.join(",")}`);
    if (cleanupError) throw cleanupError;
  },
}));
vi.mock("@/lib/storage", () => ({
  deleteUnreferencedByPublicUrl: async () => {
    order.push("urls");
    if (urlsError) throw urlsError;
  },
}));
const reported = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: (...args: unknown[]) => reported(...args) }));

import { disposeHomebrewAndDeleteCampaign } from "./useCampaigns";

beforeEach(() => {
  order.length = 0;
  rpcError = null;
  cleanupError = null;
  minisError = null;
  voicesError = null;
  urlsError = null;
  user = { id: "me" };
  reported.mockClear();
});

describe("disposeHomebrewAndDeleteCampaign file cleanup (#963)", () => {
  it("removes the import pages only after the delete succeeded", async () => {
    await disposeHomebrewAndDeleteCampaign("c1", "promote");
    expect(order).toEqual(["minis", "voices", "rpc", "sweep:c1", "urls", "import:me/page1.png"]);
  });

  // The recordings of notes read aloud are swept only once the campaign is gone: the sweep takes what nothing refers
  // to, and before the delete every note still refers to its own. The "removes nothing" test below holds the rest.
  it("removes nothing when the delete fails", async () => {
    rpcError = new Error("nope");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).rejects.toThrow("nope");
    expect(order).toEqual(["minis", "voices", "rpc"]);
  });

  // Bug caught: a campaign deleted while the voice clips of its sittings could not be removed; the rows that name
  // them go with the campaign, so the clips would be left where nothing can find them.
  it("refuses the delete when the AI table's voice clips cannot be removed", async () => {
    voicesError = new Error("clips");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "delete")).rejects.toThrow("clips");
    expect(order).toEqual(["minis", "voices"]);
  });

  it("refuses the delete when the minis cannot be removed, since nothing would name their files after it", async () => {
    minisError = new Error("storage_cleanup_failed");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).rejects.toThrow("storage_cleanup_failed");
    expect(order).toEqual(["minis"]);
  });

  it("refuses when nobody is signed in, before reading or removing anything", async () => {
    user = null;
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).rejects.toThrow("Not authenticated");
    expect(order).toEqual([]);
  });

  it("reports a failed art cleanup instead of failing the delete, and still removes the import pages", async () => {
    urlsError = new Error("cdn down");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledWith(urlsError, "campaign:deleteFiles", { campaignId: "c1", files: 1 });
    expect(order).toEqual(["minis", "voices", "rpc", "sweep:c1", "urls", "import:me/page1.png"]);
  });

  it("reports a cleanup failure instead of failing the delete", async () => {
    cleanupError = new Error("storage down");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledWith(cleanupError, "campaign:deleteImportFiles", { campaignId: "c1", files: 1 });
  });
});
