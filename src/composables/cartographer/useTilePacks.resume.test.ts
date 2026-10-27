import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TilePackGenerationJob, TilePackGenerationRun } from "@/cartographer/userPack.types";

const invoke = vi.fn();

vi.mock("./tilePackGenerator", () => ({ invokeTilePackGenerator: (body: unknown) => invoke(body) }));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: vi.fn(() => ({ data: { value: [] } })),
  useMutation: vi.fn(() => ({})),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
vi.mock("@/lib/storage", () => ({
  readEmbeddedXmp: vi.fn(async () => null),
  inheritXmpIntoVariant: vi.fn(async (blob: Blob) => blob),
}));
vi.mock("@/cartographer/normalizeGeneratedTile", () => ({
  normalizeGeneratedTile: vi.fn(async () => new Blob(["tile"], { type: "image/webp" })),
  decodeBase64: () => new Uint8Array([1]),
}));
vi.mock("@/cartographer/styleReference", () => ({
  styleReferenceFrom: vi.fn(async () => new Blob(["ref"], { type: "image/webp" })),
}));

const { useTilePacks } = await import("./useTilePacks");
const { useQuery } = await import("@tanstack/vue-query");

function job(id: string, ordinal: number, status: TilePackGenerationJob["status"]): TilePackGenerationJob {
  return {
    id, run_id: "run", ordinal, slot_id: id, phase: "proof", status,
    job: { id: `slot-${id}`, mechanics: {}, slot: {} } as TilePackGenerationJob["job"],
    attempts: [], generation_attempts: status === "pending" ? 0 : 1,
    style_ref_path: null, raw_path: null, normalized_path: null, error: null,
    updated_at: "2026-09-27T20:00:00Z",
  };
}

function runWith(jobs: TilePackGenerationJob[]) {
  return { id: "run", status: "proof_pending", tile_pack_generation_jobs: jobs } as unknown as
    TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };
}

describe("useTilePacks runNext", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ image_b64: "AA==", content_type: "image/webp" });
  });

  it("finishes a job left at generated before starting a new one, without a provider call", async () => {
    const { runNext } = useTilePacks();
    await runNext(runWith([job("a", 1, "pending"), job("b", 2, "generated")]));
    const actions = invoke.mock.calls.map(([body]) => [body.action, body.job_id]);
    expect(actions[0]).toEqual(["resume", "b"]);
    expect(actions).not.toContainEqual(["generate", "a"]);
    expect(actions).toContainEqual(["complete", "b"]);
  });

  it("generates the next pending job when nothing is left unfinished", async () => {
    const { runNext } = useTilePacks();
    await runNext(runWith([job("a", 1, "normalized"), job("b", 2, "pending")]));
    expect(invoke.mock.calls[0]![0]).toMatchObject({ action: "generate", job_id: "b" });
  });

  it("reports nothing to do when every job is finished or in flight", async () => {
    const { runNext } = useTilePacks();
    expect(await runNext(runWith([job("a", 1, "normalized"), job("b", 2, "generating")]))).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("takes the lowest ordinal first, whatever order the rows arrive in", async () => {
    const { runNext } = useTilePacks();
    await runNext(runWith([job("late", 3, "pending"), job("first", 1, "pending"), job("mid", 2, "pending")]));
    expect(invoke.mock.calls[0]![0]).toMatchObject({ action: "generate", job_id: "first" });
  });

  it("does nothing for a run that is no longer in flight, even with pending jobs left", async () => {
    const { runNext } = useTilePacks();
    const packJob = { ...job("a", 1, "pending"), phase: "pack" as const };
    const finished = { ...runWith([packJob]), status: "completed" } as ReturnType<typeof runWith>;
    expect(await runNext(finished)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("useTilePacks run polling", () => {
  // CLAUDE.md "Live Data": job progress is the one sanctioned poll, and only while a run is in flight.
  it("polls the runs only while one is in flight, so an idle manager sends nothing", () => {
    useTilePacks();
    type Poll = (query: { state: { data: { status: string }[] } }) => number | false;
    const pollOf = (options: unknown): Poll | null =>
      typeof options === "object" && options !== null && "refetchInterval" in options && typeof options.refetchInterval === "function"
        ? (options.refetchInterval as Poll)
        : null;
    const interval = vi.mocked(useQuery).mock.calls.map(([options]) => pollOf(options)).find((poll) => poll !== null);
    if (!interval) throw new Error("the runs query sets no refetchInterval");
    const polled = (...statuses: string[]) => interval({ state: { data: statuses.map((status) => ({ status })) } });
    expect(polled("completed", "failed")).toBe(false);
    expect(polled("completed", "generating")).not.toBe(false);
    expect(polled("proof_pending")).not.toBe(false);
    expect(polled("cancelling")).not.toBe(false);
  });
});
