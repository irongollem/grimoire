import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const removed: { bucket: string; paths: string[] }[] = [];
let removeError: Error | null = null;
const invoked: { fn: string; body: unknown }[] = [];
let invokeError: Error | null = null;

vi.mock("@edge-shared/edgeError.ts", () => ({ edgeErrorMessage: async (e: Error) => e.message }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: async (fn: string, options: { body: unknown }) => {
        invoked.push({ fn, body: options.body });
        return { data: null, error: invokeError };
      },
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { error: removeError };
        },
      }),
    },
    from: (table: string) => fake.client.from(table),
  },
}));

import { campaignFileUrls, campaignImportSourcePaths, deleteCampaignMinis, deleteImportSourcePaths, CASCADED_TABLES, DISPOSED_TABLES } from "./campaignFiles";
import { IMAGE_REFERENCES } from "@/lib/storage/deleteUnreferenced";

beforeEach(() => {
  fake.reset();
  removed.length = 0;
  removeError = null;
  invoked.length = 0;
  invokeError = null;
  fake.seed("campaigns", [{ id: "c1", user_id: "u1", group_portrait_url: "https://cdn/group.webp", demo_source: null }]);
});

describe("campaignFileUrls (#918)", () => {
  it("collects the files the cascade orphans, and the campaign's own portrait", async () => {
    fake.seed("locations", [{ campaign_id: "c1", user_id: "u1", image_url: "https://cdn/loc.webp", map_url: "https://cdn/map.webp", map_layer_url: null }]);
    fake.seed("deities", [{ campaign_id: "c1", user_id: "u1", portrait_url: null, symbol_image_url: "https://cdn/sym.webp" }]);
    fake.seed("monsters", [{ campaign_id: "c1", user_id: "u1", image_url: "https://cdn/m.webp", cutout_url: null }]);

    const urls = await campaignFileUrls("c1", "u1", "promote");

    expect(urls.sort()).toEqual(["https://cdn/group.webp", "https://cdn/loc.webp", "https://cdn/map.webp", "https://cdn/sym.webp"]);
  });

  it("adds the deleted homebrew's files only when the DM deletes it", async () => {
    fake.seed("monsters", [{ campaign_id: "c1", user_id: "u1", image_url: "https://cdn/m.webp", cutout_url: "https://cdn/m-cut.webp" }]);
    const urls = await campaignFileUrls("c1", "u1", "delete");
    expect(urls).toContain("https://cdn/m.webp");
    expect(urls).toContain("https://cdn/m-cut.webp");
  });

  // RLS is a ceiling: a DM can read other members' rows in their campaign, and the delete may only
  // remove the files of rows the caller owns (a same-account copy elsewhere shares them).
  it("never collects another member's files, or files of the same account in another campaign", async () => {
    fake.seed("locations", [
      { campaign_id: "c1", user_id: "player", image_url: "https://cdn/theirs.webp", map_url: null, map_layer_url: null },
      { campaign_id: "other", user_id: "u1", image_url: "https://cdn/elsewhere.webp", map_url: null, map_layer_url: null },
      { campaign_id: "c1", user_id: "u1", image_url: "https://cdn/mine.webp", map_url: null, map_layer_url: null },
    ]);
    fake.seed("ai_generation_jobs", [
      { campaign_id: "c1", user_id: "player", artifact_url: "https://cdn/their-track.mp3" },
      { campaign_id: "c1", user_id: "u1", artifact_url: "https://cdn/my-track.mp3" },
    ]);

    const urls = await campaignFileUrls("c1", "u1", "delete");

    expect(urls.sort()).toEqual(["https://cdn/group.webp", "https://cdn/mine.webp", "https://cdn/my-track.mp3"]);
  });

  it("collects nothing for a campaign the caller does not own", async () => {
    fake.seed("locations", [{ campaign_id: "c1", user_id: "u1", image_url: "https://cdn/loc.webp", map_url: null, map_layer_url: null }]);
    expect(await campaignFileUrls("c1", "someone-else", "delete")).toEqual([]);
  });

  it("throws when a read fails rather than reading it as no files", async () => {
    fake.failNext("locations", { message: "boom" });
    await expect(campaignFileUrls("c1", "u1", "promote")).rejects.toThrow("boom");
  });

  it("leaves a demo campaign's files alone: they are the template author's", async () => {
    fake.reset();
    fake.seed("campaigns", [{ id: "c1", user_id: "u1", group_portrait_url: "https://cdn/group.webp", demo_source: "sugarwell" }]);
    fake.seed("locations", [{ campaign_id: "c1", user_id: "u1", image_url: "https://cdn/loc.webp", map_url: null, map_layer_url: null }]);
    expect(await campaignFileUrls("c1", "u1", "delete")).toEqual([]);
  });

  it("names only tables the reference check knows, so every collected file is checked", () => {
    const known = new Set<string>(IMAGE_REFERENCES.map(([table]) => table));
    for (const table of [...CASCADED_TABLES, ...DISPOSED_TABLES]) expect(known.has(table)).toBe(true);
  });
});

describe("campaignImportSourcePaths (#963)", () => {
  it("collects the pages of every import, for the caller in this campaign only", async () => {
    fake.seed("document_imports", [
      { campaign_id: "c1", user_id: "u1", source_paths: ["u1/a.pdf", "u1/b.png"] },
      { campaign_id: "c1", user_id: "u1", source_paths: [] },
      { campaign_id: "c1", user_id: "u1", source_paths: ["u1/c.webp"] },
      { campaign_id: "c1", user_id: "player", source_paths: ["player/x.pdf"] },
      { campaign_id: "other", user_id: "u1", source_paths: ["u1/elsewhere.pdf"] },
    ]);
    expect(await campaignImportSourcePaths("c1", "u1")).toEqual(["u1/a.pdf", "u1/b.png", "u1/c.webp"]);
  });

  it("returns nothing for a demo campaign", async () => {
    fake.reset();
    fake.seed("campaigns", [{ id: "c1", user_id: "u1", group_portrait_url: null, demo_source: "sugarwell" }]);
    fake.seed("document_imports", [{ campaign_id: "c1", user_id: "u1", source_paths: ["u1/a.pdf"] }]);
    expect(await campaignImportSourcePaths("c1", "u1")).toEqual([]);
  });

  it("throws when the read fails", async () => {
    fake.failNext("document_imports", { message: "boom" });
    await expect(campaignImportSourcePaths("c1", "u1")).rejects.toThrow("boom");
  });
});

describe("deleteImportSourcePaths (#963)", () => {
  it("removes the paths from the import-documents bucket", async () => {
    await deleteImportSourcePaths(["u1/a.pdf"]);
    expect(removed).toEqual([{ bucket: "import-documents", paths: ["u1/a.pdf"] }]);
  });

  it("does nothing for no paths", async () => {
    await deleteImportSourcePaths([]);
    expect(removed).toEqual([]);
  });

  it("throws a storage error", async () => {
    removeError = new Error("denied");
    await expect(deleteImportSourcePaths(["u1/a.pdf"])).rejects.toThrow("denied");
  });
});

describe("deleteCampaignMinis (#963)", () => {
  it("asks forge-mini to delete the campaign's minis when it has any", async () => {
    fake.seed("minis", [{ id: "m1", campaign_id: "c1" }, { id: "m2", campaign_id: "c1" }]);
    await deleteCampaignMinis("c1");
    expect(invoked).toEqual([{ fn: "forge-mini", body: { action: "delete_campaign", campaign_id: "c1" } }]);
  });

  it("does not call the edge function for a campaign with no minis, whatever other campaigns hold", async () => {
    fake.seed("minis", [{ id: "m9", campaign_id: "c2" }]);
    await deleteCampaignMinis("c1");
    expect(invoked).toEqual([]);
  });

  it("throws when the count fails, before asking anything", async () => {
    fake.failNext("minis", { message: "boom", code: "XX000" });
    await expect(deleteCampaignMinis("c1")).rejects.toThrow("boom");
    expect(invoked).toEqual([]);
  });

  it("throws the edge function's error", async () => {
    fake.seed("minis", [{ id: "m1", campaign_id: "c1" }]);
    invokeError = new Error("storage_cleanup_failed");
    await expect(deleteCampaignMinis("c1")).rejects.toThrow("storage_cleanup_failed");
  });
});
