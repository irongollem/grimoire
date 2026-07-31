import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import {
  assertRedistributableDocuments,
  countByRuleset,
  fetchAllRows,
  parseSeedCliArgs,
  upsertBatch,
  withOpen5eUserAgent,
} from "./seed-helpers";

afterEach(() => vi.unstubAllGlobals());

describe("withOpen5eUserAgent", () => {
  it("adds a descriptive User-Agent for api.open5e.com requests", () => {
    const headers = withOpen5eUserAgent("https://api.open5e.com/v2/spells/?limit=500");
    expect(new Headers(headers).get("User-Agent")).toBe("grimoire-seed-script (+https://dungeongrimoire.com)");
  });

  it("preserves existing headers alongside the injected User-Agent", () => {
    const headers = withOpen5eUserAgent("https://api.open5e.com/v2/spells/", { Accept: "application/json" });
    const merged = new Headers(headers);
    expect(merged.get("Accept")).toBe("application/json");
    expect(merged.get("User-Agent")).toBe("grimoire-seed-script (+https://dungeongrimoire.com)");
  });

  it("leaves non-Open5e requests untouched", () => {
    const headers = withOpen5eUserAgent("https://example.test/rest/v1/library_spells", { Accept: "application/json" });
    expect(headers).toEqual({ Accept: "application/json" });
  });

  it("leaves undefined headers as undefined for non-Open5e requests", () => {
    expect(withOpen5eUserAgent("https://example.test/rest/v1/library_spells")).toBeUndefined();
  });
});

describe("parseSeedCliArgs", () => {
  it("defaults every flag to false and documentKeys to empty with no args", () => {
    expect(parseSeedCliArgs([])).toEqual({ list: false, all: false, dryRun: false, documentKeys: [] });
  });

  it("recognizes --list, --all, and --dry-run independently of order", () => {
    expect(parseSeedCliArgs(["--dry-run", "--all"])).toEqual({
      list: false, all: true, dryRun: true, documentKeys: [],
    });
    expect(parseSeedCliArgs(["--list"])).toEqual({
      list: true, all: false, dryRun: false, documentKeys: [],
    });
  });

  it("collects bare args as explicit document keys", () => {
    expect(parseSeedCliArgs(["srd-2014", "srd-2024"])).toEqual({
      list: false, all: false, dryRun: false, documentKeys: ["srd-2014", "srd-2024"],
    });
  });

  it("separates flags from document keys regardless of interleaving", () => {
    expect(parseSeedCliArgs(["srd-2014", "--dry-run", "srd-2024"])).toEqual({
      list: false, all: false, dryRun: true, documentKeys: ["srd-2014", "srd-2024"],
    });
  });
});

describe("assertRedistributableDocuments", () => {
  const srd2014: Open5eDocumentRef = {
    key: "srd-2014",
    name: "System Reference Document 5.1",
    licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }],
  };
  const ccdx: Open5eDocumentRef = {
    key: "ccdx",
    name: "Creature Codex",
    licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
  };
  const unconfirmed: Open5eDocumentRef = {
    key: "unconfirmed-doc",
    name: "Unconfirmed Document",
    licenses: [],
  };
  const disallowed: Open5eDocumentRef = {
    key: "disallowed-doc",
    name: "Disallowed Document",
    licenses: [{ name: "Some Other License", key: "some-other-license" }],
  };
  const documents = [srd2014, ccdx, unconfirmed, disallowed];

  it("does not throw when every requested key resolves to a redistributable document", () => {
    expect(() => assertRedistributableDocuments(["srd-2014"], documents)).not.toThrow();
  });

  it("resolves a legacy alias (\"cc\" -> \"ccdx\") through LEGACY_DOCUMENT_KEY_ALIASES before checking", () => {
    expect(() => assertRedistributableDocuments(["cc"], documents)).not.toThrow();
  });

  it("throws naming the offending key for one that doesn't exist upstream", () => {
    expect(() => assertRedistributableDocuments(["totally-made-up"], documents)).toThrow(/totally-made-up/);
  });

  it("throws for a document with an empty licenses array", () => {
    expect(() => assertRedistributableDocuments(["unconfirmed-doc"], documents)).toThrow(/unconfirmed-doc/);
  });

  it("throws naming the disallowed license for a document with a non-whitelisted license key", () => {
    expect(() => assertRedistributableDocuments(["disallowed-doc"], documents)).toThrow(/some-other-license/);
  });

  it("throws once naming every offending key in a mixed request, without rejecting the good ones", () => {
    expect(() =>
      assertRedistributableDocuments(["srd-2014", "unconfirmed-doc", "totally-made-up"], documents),
    ).toThrow(/unconfirmed-doc/);
    try {
      assertRedistributableDocuments(["srd-2014", "unconfirmed-doc", "totally-made-up"], documents);
      throw new Error("expected assertRedistributableDocuments to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("srd-2014");
      expect(message).toContain("unconfirmed-doc");
      expect(message).toContain("totally-made-up");
    }
  });
});

describe("countByRuleset", () => {
  it("returns an empty object for no rows", () => {
    expect(countByRuleset([])).toEqual({});
  });

  it("tallies rows per ruleset", () => {
    const rows = [{ ruleset: "2014" }, { ruleset: "2024" }, { ruleset: "2014" }, { ruleset: "2014" }];
    expect(countByRuleset(rows)).toEqual({ "2014": 3, "2024": 1 });
  });
});

/**
 * Builds a fake PostgrestError with just the fields fetchAllRows/upsertBatch
 * read. `PostgrestError` is a class (extends `Error`, adds `toJSON()`) —
 * cast through `unknown` rather than stub every class member.
 */
function fakePostgrestError(message: string): PostgrestError {
  return { message, details: "", hint: "", code: "500", name: "PostgrestError" } as unknown as PostgrestError;
}

describe("fetchAllRows", () => {
  it("stops after a single short page without a second request", async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => {
      expect(from).toBe(0);
      expect(to).toBe(999);
      return { data: [{ id: "a" }, { id: "b" }], error: null };
    });

    const rows = await fetchAllRows(fetchPage);

    expect(rows).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("concatenates multiple full pages until a short page terminates the loop", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `row-${i}` }));
    const shortPage = [{ id: "last" }];
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 1000 ? shortPage : fullPage,
      error: null,
    }));

    const rows = await fetchAllRows(fetchPage);

    expect(rows).toHaveLength(1001);
    expect(rows[rows.length - 1]).toEqual({ id: "last" });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("treats a null data page as empty and still stops the loop", async () => {
    const fetchPage = vi.fn(async () => ({ data: null, error: null }));

    const rows = await fetchAllRows(fetchPage);

    expect(rows).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("throws on a page error instead of returning partial rows", async () => {
    const fetchPage = vi.fn(async () => ({ data: null, error: fakePostgrestError("boom") }));

    await expect(fetchAllRows(fetchPage)).rejects.toEqual(fakePostgrestError("boom"));
  });
});

/**
 * Minimal stand-in for the slice of SupabaseClient upsertBatch touches
 * (`.from(table).upsert(rows, { onConflict })`). Cast through `unknown` —
 * not the full client shape, but the only two methods the helper calls.
 */
function fakeSupabaseClient(
  upsert: (table: string, rows: unknown[], options: { onConflict: string }) => { error: PostgrestError | null },
): SupabaseClient {
  return {
    from: (table: string) => ({
      upsert: (rows: unknown[], options: { onConflict: string }) => upsert(table, rows, options),
    }),
  } as unknown as SupabaseClient;
}

describe("upsertBatch", () => {
  it("batches rows in groups of 50 by default and passes onConflict through", async () => {
    const calls: Array<{ table: string; rows: unknown[]; onConflict: string }> = [];
    const supabase = fakeSupabaseClient((table, rows, options) => {
      calls.push({ table, rows, onConflict: options.onConflict });
      return { error: null };
    });

    const rows = Array.from({ length: 120 }, (_, i) => ({ id: `row-${i}` }));
    await upsertBatch(supabase, "library_spells", rows, "source_document_key,source_record_key");

    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.rows.length)).toEqual([50, 50, 20]);
    expect(calls.every((c) => c.table === "library_spells")).toBe(true);
    expect(calls.every((c) => c.onConflict === "source_document_key,source_record_key")).toBe(true);
  });

  it("throws immediately on an upsert error without issuing further batches", async () => {
    let callCount = 0;
    const supabase = fakeSupabaseClient(() => {
      callCount += 1;
      return { error: fakePostgrestError("conflict") };
    });

    const rows = Array.from({ length: 120 }, (_, i) => ({ id: `row-${i}` }));
    await expect(
      upsertBatch(supabase, "library_spells", rows, "source_document_key,source_record_key"),
    ).rejects.toEqual(fakePostgrestError("conflict"));
    expect(callCount).toBe(1);
  });

  it("respects a custom batch size", async () => {
    const calls: unknown[][] = [];
    const supabase = fakeSupabaseClient((_table, rows) => {
      calls.push(rows);
      return { error: null };
    });

    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `row-${i}` }));
    await upsertBatch(supabase, "library_monsters", rows, "source_document_key,source_record_key", 3);

    expect(calls.map((c) => c.length)).toEqual([3, 3, 1]);
  });
});
