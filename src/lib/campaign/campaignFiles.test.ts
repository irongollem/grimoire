import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, Record<string, unknown>[]>();
const reads: { table: string; filters: Record<string, string> }[] = [];
let readError: Error | null = null;
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
    from: (table: string) => {
      const filters: Record<string, string> = {};
      // A real Promise carrying the builder methods, so `await` works without a
      // hand-written `then`.
      const builder = (): Promise<{ data: Record<string, unknown>[] | null; count: number | null; error: Error | null }> & object =>
        Object.assign(Promise.resolve({
          data: readError ? null : rows.get(table) ?? [],
          count: readError ? null : rows.get(table)?.length ?? 0,
          error: readError,
        }), {
          eq: (column: string, value: string) => {
            filters[column] = value;
            if (column === "user_id" && table !== "campaigns") reads.push({ table, filters });
            return builder();
          },
          maybeSingle: async () => ({ data: rows.get(table)?.[0] ?? null, error: table === "campaigns" ? null : readError }),
        });
      return { select: () => builder() };
    },
  },
}));

import { campaignFileUrls, campaignImportSourcePaths, deleteCampaignMinis, deleteImportSourcePaths, CASCADED_TABLES, DISPOSED_TABLES } from "./campaignFiles";
import { IMAGE_REFERENCES } from "@/lib/storage/deleteUnreferenced";

beforeEach(() => {
  rows.clear();
  reads.length = 0;
  readError = null;
  removed.length = 0;
  removeError = null;
  invoked.length = 0;
  invokeError = null;
  rows.set("campaigns", [{ group_portrait_url: "https://cdn/group.webp", demo_source: null }]);
});

describe("campaignFileUrls (#918)", () => {
  it("collects the files the cascade orphans, and the campaign's own portrait", async () => {
    rows.set("locations", [{ image_url: "https://cdn/loc.webp", map_url: "https://cdn/map.webp", map_layer_url: null }]);
    rows.set("deities", [{ portrait_url: null, symbol_image_url: "https://cdn/sym.webp" }]);
    rows.set("monsters", [{ image_url: "https://cdn/m.webp", cutout_url: null }]);

    const urls = await campaignFileUrls("c1", "u1", "promote");

    expect(urls.sort()).toEqual(["https://cdn/group.webp", "https://cdn/loc.webp", "https://cdn/map.webp", "https://cdn/sym.webp"]);
  });

  it("adds the deleted homebrew's files only when the DM deletes it", async () => {
    rows.set("monsters", [{ image_url: "https://cdn/m.webp", cutout_url: "https://cdn/m-cut.webp" }]);
    const urls = await campaignFileUrls("c1", "u1", "delete");
    expect(urls).toContain("https://cdn/m.webp");
    expect(urls).toContain("https://cdn/m-cut.webp");
  });

  it("reads only the caller's rows in this campaign", async () => {
    await campaignFileUrls("c1", "u1", "delete");
    expect(reads.length).toBe(CASCADED_TABLES.length + DISPOSED_TABLES.length + 1);
    expect(reads.every((r) => r.filters.campaign_id === "c1" && r.filters.user_id === "u1")).toBe(true);
  });

  it("collects a generated artifact's URL, to go through the reference check (#963)", async () => {
    rows.set("ai_generation_jobs", [{ artifact_url: "https://cdn/sounds/u1/ai/j.mp3" }, { artifact_url: null }]);
    const urls = await campaignFileUrls("c1", "u1", "promote");
    expect(urls).toContain("https://cdn/sounds/u1/ai/j.mp3");
    expect(reads.some((r) => r.table === "ai_generation_jobs")).toBe(true);
  });

  it("throws when a read fails rather than reading it as no files", async () => {
    readError = new Error("boom");
    await expect(campaignFileUrls("c1", "u1", "promote")).rejects.toThrow("boom");
  });

  it("leaves a demo campaign's files alone: they are the template author's", async () => {
    rows.set("campaigns", [{ group_portrait_url: "https://cdn/group.webp", demo_source: "sugarwell" }]);
    rows.set("locations", [{ image_url: "https://cdn/loc.webp", map_url: null, map_layer_url: null }]);
    expect(await campaignFileUrls("c1", "u1", "delete")).toEqual([]);
  });

  it("names only tables the reference check knows, so every collected file is checked", () => {
    const known = new Set<string>(IMAGE_REFERENCES.map(([table]) => table));
    for (const table of [...CASCADED_TABLES, ...DISPOSED_TABLES]) expect(known.has(table)).toBe(true);
  });
});

describe("campaignImportSourcePaths (#963)", () => {
  it("collects the pages of every import, for the caller in this campaign only", async () => {
    rows.set("document_imports", [{ source_paths: ["u1/a.pdf", "u1/b.png"] }, { source_paths: [] }, { source_paths: ["u1/c.webp"] }]);
    expect(await campaignImportSourcePaths("c1", "u1")).toEqual(["u1/a.pdf", "u1/b.png", "u1/c.webp"]);
    const read = reads.find((r) => r.table === "document_imports");
    expect(read?.filters).toEqual({ campaign_id: "c1", user_id: "u1" });
  });

  it("returns nothing for a demo campaign", async () => {
    rows.set("campaigns", [{ group_portrait_url: null, demo_source: "sugarwell" }]);
    rows.set("document_imports", [{ source_paths: ["u1/a.pdf"] }]);
    expect(await campaignImportSourcePaths("c1", "u1")).toEqual([]);
  });

  it("throws when the read fails", async () => {
    readError = new Error("boom");
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
    rows.set("minis", [{ id: "m1" }, { id: "m2" }]);
    await deleteCampaignMinis("c1");
    expect(invoked).toEqual([{ fn: "forge-mini", body: { action: "delete_campaign", campaign_id: "c1" } }]);
  });

  it("does not call the edge function for a campaign with no minis", async () => {
    await deleteCampaignMinis("c1");
    expect(invoked).toEqual([]);
  });

  it("throws when the count fails, before asking anything", async () => {
    readError = new Error("boom");
    await expect(deleteCampaignMinis("c1")).rejects.toThrow("boom");
    expect(invoked).toEqual([]);
  });

  it("throws the edge function's error", async () => {
    rows.set("minis", [{ id: "m1" }]);
    invokeError = new Error("storage_cleanup_failed");
    await expect(deleteCampaignMinis("c1")).rejects.toThrow("storage_cleanup_failed");
  });
});
