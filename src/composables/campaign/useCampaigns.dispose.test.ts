import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
let rpcError: Error | null = null;
let cleanupError: Error | null = null;
let minisError: Error | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async () => {
      order.push("rpc");
      return { error: rpcError };
    },
  },
  getCurrentUser: () => ({ id: "me" }),
}));
vi.mock("@/lib/analytics", () => ({ track: () => {} }));
vi.mock("@/lib/campaign/campaignFiles", () => ({
  campaignFileUrls: async () => ["https://cdn/a.webp"],
  campaignImportSourcePaths: async () => ["me/page1.png"],
  deleteCampaignMinis: async () => {
    order.push("minis");
    if (minisError) throw minisError;
  },
  deleteImportSourcePaths: async (paths: string[]) => {
    order.push(`import:${paths.join(",")}`);
    if (cleanupError) throw cleanupError;
  },
}));
vi.mock("@/lib/storage", () => ({
  deleteUnreferencedByPublicUrl: async () => {
    order.push("urls");
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
  reported.mockClear();
});

describe("disposeHomebrewAndDeleteCampaign file cleanup (#963)", () => {
  it("removes the import pages only after the delete succeeded", async () => {
    await disposeHomebrewAndDeleteCampaign("c1", "promote");
    expect(order).toEqual(["minis", "rpc", "urls", "import:me/page1.png"]);
  });

  it("removes nothing when the delete fails", async () => {
    rpcError = new Error("nope");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).rejects.toThrow("nope");
    expect(order).toEqual(["minis", "rpc"]);
  });

  it("refuses the delete when the minis cannot be removed, since nothing would name their files after it", async () => {
    minisError = new Error("storage_cleanup_failed");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).rejects.toThrow("storage_cleanup_failed");
    expect(order).toEqual(["minis"]);
  });

  it("reports a cleanup failure instead of failing the delete", async () => {
    cleanupError = new Error("storage down");
    await expect(disposeHomebrewAndDeleteCampaign("c1", "promote")).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledWith(cleanupError, "campaign:deleteImportFiles", { campaignId: "c1", files: 1 });
  });
});
