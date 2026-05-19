/**
 * Behavioral tests for the importer's CLI-level guarantees. The pure parsing
 * tests live in `scripts/lib/parse-faiths.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  DRY_RUN_PANTHEON_UUIDS,
  ensurePantheons,
} from "./import-faiths";

// Minimal Logger shape (matches the non-exported interface via structural typing).
const noopLog = { info: () => {}, warn: () => {}, debug: () => {} };

/** Build a stub Supabase client that:
 *   - allows SELECT chains (returns the data the test prescribes)
 *   - records any call to `.insert()` so the test can assert "no writes"
 */
function makeStubClient(existingPantheons: Array<{ id: string; name: string }>) {
  const insertCalls: unknown[] = [];
  const stub = {
    from: (_table: string) => ({
      select: () => ({
        eq: function eqChain(): unknown { return this; },
        in: () => Promise.resolve({ data: existingPantheons, error: null }),
      }),
      insert: (payload: unknown) => {
        insertCalls.push(payload);
        return { select: () => Promise.resolve({ data: [], error: null }) };
      },
    }),
  };
  // Make `eq()` chainable so `.eq(...).eq(...).in(...)` resolves.
  const select = stub.from("pantheons").select;
  // Replace the eq function with one that returns the same select shape.
  stub.from = (_table: string) => {
    const fromShape: ReturnType<typeof stub.from> = {
      select: () => {
        const selectShape: ReturnType<typeof select> = {
          eq: function chain() { return selectShape; },
          in: () => Promise.resolve({ data: existingPantheons, error: null }),
        };
        return selectShape;
      },
      insert: (payload: unknown) => {
        insertCalls.push(payload);
        return { select: () => Promise.resolve({ data: [], error: null }) };
      },
    };
    return fromShape;
  };
  return {
    client: stub as unknown as Parameters<typeof ensurePantheons>[0],
    insertCalls,
  };
}

describe("ensurePantheons — dry-run performs ZERO writes", () => {
  it("against an empty-pantheons campaign, dry-run does NOT insert and returns placeholder UUIDs", async () => {
    const { client, insertCalls } = makeStubClient([]);

    const result = await ensurePantheons(client, "user-uuid", "campaign-uuid", noopLog, /*dryRun=*/ true);

    expect(insertCalls).toEqual([]); // ← the contract: no writes
    expect(result.size).toBe(3);
    // All 3 pantheons resolve to placeholder UUIDs (none existed)
    expect(result.get("Heavenly Bodies")).toBe(DRY_RUN_PANTHEON_UUIDS["Heavenly Bodies"]);
    expect(result.get("Lesser Deities")).toBe(DRY_RUN_PANTHEON_UUIDS["Lesser Deities"]);
    expect(result.get("Folk and Margin Figures")).toBe(DRY_RUN_PANTHEON_UUIDS["Folk and Margin Figures"]);
  });

  it("against a partially-populated campaign, dry-run uses real UUIDs for existing + placeholders for missing", async () => {
    // Simulate: Heavenly Bodies already exists; the other 2 do not.
    const realHeavenlyUuid = "abcd1234-aaaa-bbbb-cccc-000000000000";
    const { client, insertCalls } = makeStubClient([
      { id: realHeavenlyUuid, name: "Heavenly Bodies" },
    ]);

    const result = await ensurePantheons(client, "user-uuid", "campaign-uuid", noopLog, /*dryRun=*/ true);

    expect(insertCalls).toEqual([]); // ← still no writes
    expect(result.get("Heavenly Bodies")).toBe(realHeavenlyUuid); // real UUID preserved
    expect(result.get("Lesser Deities")).toBe(DRY_RUN_PANTHEON_UUIDS["Lesser Deities"]);
    expect(result.get("Folk and Margin Figures")).toBe(DRY_RUN_PANTHEON_UUIDS["Folk and Margin Figures"]);
  });

  it("against a fully-populated campaign, dry-run returns all real UUIDs (no placeholders, no inserts)", async () => {
    const realIds = {
      "Heavenly Bodies": "11111111-1111-1111-1111-111111111111",
      "Lesser Deities": "22222222-2222-2222-2222-222222222222",
      "Folk and Margin Figures": "33333333-3333-3333-3333-333333333333",
    };
    const { client, insertCalls } = makeStubClient(
      Object.entries(realIds).map(([name, id]) => ({ id, name })),
    );

    const result = await ensurePantheons(client, "user-uuid", "campaign-uuid", noopLog, /*dryRun=*/ true);

    expect(insertCalls).toEqual([]);
    for (const [name, id] of Object.entries(realIds)) {
      expect(result.get(name)).toBe(id);
    }
  });

  it("control case: when dryRun=false against empty-pantheons, DOES call insert", async () => {
    const { client, insertCalls } = makeStubClient([]);

    await ensurePantheons(client, "user-uuid", "campaign-uuid", noopLog, /*dryRun=*/ false);

    expect(insertCalls.length).toBeGreaterThan(0);
  });
});

describe("DRY_RUN_PANTHEON_UUIDS — placeholder shape", () => {
  it("uses recognizable DEAD-BEEF-tagged placeholders for all 3 pantheons", () => {
    for (const [_name, uuid] of Object.entries(DRY_RUN_PANTHEON_UUIDS)) {
      // The DEAD/4EEF middle is the recognizable marker — real v4 UUIDs would
      // never have these segments, so any accidental DB write attempting to
      // use one would fail loudly rather than silently corrupting data.
      expect(uuid).toMatch(/-dead-4eef-/);
    }
  });
});
