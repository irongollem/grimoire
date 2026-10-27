import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TilePackGenerationJob, TilePackGenerationRun } from "@/cartographer/userPack.types";

/**
 * EU AI Act Art 50 marking (#889 S2): the edge function marks the generated
 * bytes, canvas re-encoding drops embedded metadata unconditionally, and the
 * re-embed in `useTilePacks` is the only thing between a marked tile and an
 * unmarked one reaching storage. The canvas itself does not exist in the test
 * DOM, so the normalizer is stubbed to an unmarked blob and the assertion is
 * made on what is sent to the edge function.
 */
const invoke = vi.fn();

vi.mock("./tilePackGenerator", () => ({ invokeTilePackGenerator: (body: unknown) => invoke(body) }));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: vi.fn(() => ({ data: { value: [] } })),
  useMutation: vi.fn(() => ({})),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
vi.mock("@/lib/storage", () => ({
  readEmbeddedXmp: vi.fn(async () => "SOURCE-XMP"),
  inheritXmpIntoVariant: vi.fn(async (blob: Blob, xmp: string | null) => new Blob([`${await blob.text()}+${xmp}`])),
}));
vi.mock("@/cartographer/normalizeGeneratedTile", () => ({
  normalizeGeneratedTile: vi.fn(async () => new Blob(["tile"], { type: "image/webp" })),
  decodeBase64: () => new Uint8Array([1]),
}));
vi.mock("@/cartographer/styleReference", () => ({
  styleReferenceFrom: vi.fn(async () => new Blob(["ref"], { type: "image/webp" })),
}));

const { useTilePacks } = await import("./useTilePacks");

function job(phase: TilePackGenerationJob["phase"]): TilePackGenerationJob {
  return {
    id: "a", run_id: "run", ordinal: 1, slot_id: "a", phase, status: "pending",
    job: { id: "slot-a", mechanics: {}, slot: {} } as TilePackGenerationJob["job"],
    attempts: [], generation_attempts: 0,
    style_ref_path: null, raw_path: null, normalized_path: null, error: null,
    updated_at: "2026-09-27T20:00:00Z",
  };
}

const run = (phase: TilePackGenerationJob["phase"]) =>
  ({ id: "run", status: phase === "proof" ? "proof_pending" : "generating", tile_pack_generation_jobs: [job(phase)] }) as unknown as
    TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };

const sent = (b64: unknown) => atob(String(b64));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ image_b64: "AA==", content_type: "image/webp" });
});

describe("useTilePacks: generated tiles keep their provenance", () => {
  it("sends the tile with the source's XMP re-embedded, not the bare normalized one", async () => {
    await useTilePacks().runNext(run("pack"));
    const complete = invoke.mock.calls.map(([body]) => body).find((body) => body.action === "complete");
    expect(sent(complete.image_b64)).toBe("tile+SOURCE-XMP");
  });

  it("keeps the style reference unmarked, because it is only ever fed back into generation", async () => {
    await useTilePacks().runNext(run("proof"));
    const complete = invoke.mock.calls.map(([body]) => body).find((body) => body.action === "complete");
    expect(sent(complete.style_ref_b64)).toBe("ref");
  });

  it("sends no style reference for a pack-phase tile", async () => {
    await useTilePacks().runNext(run("pack"));
    const complete = invoke.mock.calls.map(([body]) => body).find((body) => body.action === "complete");
    expect(complete).not.toHaveProperty("style_ref_b64");
  });
});
