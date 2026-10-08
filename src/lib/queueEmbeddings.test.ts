import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));

import { EMBED_MANY_CHUNK, queueEmbeddings, queueEmbeddingsInBackground } from "./queueEmbeddings";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

function ok(body: unknown) {
  return { data: body, error: null };
}
function httpError(status: number, body: unknown) {
  const context = new Response(JSON.stringify(body), { status });
  return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) };
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.report.mockReset();
});

describe("queueEmbeddings", () => {
  it("sends one many-mode request for a small set", async () => {
    mocks.invoke.mockResolvedValue(ok({ embedded: ["id0", "id1"], unchanged: [] }));
    const r = await queueEmbeddings("npc", ["id0", "id1"]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "many", entity: "npc", ids: ["id0", "id1"] } });
    expect(r).toEqual({ embedded: 2, processed: 2, failed: 0, rateLimited: false });
  });

  it("routes quests to embed-content with the quest entity", async () => {
    mocks.invoke.mockResolvedValue(ok({ embedded: ["q0"], unchanged: [] }));
    const r = await queueEmbeddings("quest", ["q0"]);
    expect(mocks.invoke).toHaveBeenCalledWith("embed-content", { body: { mode: "many", entity: "quest", ids: ["q0"] } });
    expect(r).toEqual({ embedded: 1, processed: 1, failed: 0, rateLimited: false });
  });

  it("routes monsters to embed-monsters with monster_ids", async () => {
    mocks.invoke.mockResolvedValue(ok({ embedded: ["id0"], unchanged: ["id1"] }));
    const r = await queueEmbeddings("monster", ["id0", "id1"]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("embed-monsters", { body: { mode: "many", monster_ids: ["id0", "id1"] } });
    expect(r).toEqual({ embedded: 1, processed: 2, failed: 0, rateLimited: false });
  });

  it("dedupes and chunks by the server cap", async () => {
    mocks.invoke.mockImplementation(async (_fn: string, opts: { body: { ids: string[] } }) =>
      ok({ embedded: opts.body.ids }),
    );
    const r = await queueEmbeddings("location", [...ids(250), ...ids(10)]);
    expect(mocks.invoke.mock.calls.map((c) => c[1].body.ids.length)).toEqual([EMBED_MANY_CHUNK, EMBED_MANY_CHUNK, 50]);
    expect(r.embedded).toBe(250);
  });

  it("stops at rate_limited and does not send later chunks", async () => {
    mocks.invoke
      .mockResolvedValueOnce(ok({ embedded: ids(EMBED_MANY_CHUNK) }))
      .mockResolvedValueOnce(httpError(429, { error: "rate_limited" }));
    const r = await queueEmbeddings("note", ids(350));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ embedded: EMBED_MANY_CHUNK, processed: EMBED_MANY_CHUNK, failed: 0, rateLimited: true });
  });

  it("counts a failed chunk, reports it and carries on", async () => {
    mocks.invoke
      .mockResolvedValueOnce(httpError(500, { error: "Embedding failed" }))
      .mockResolvedValueOnce(ok({ embedded: ids(5) }));
    const r = await queueEmbeddings("item", ids(EMBED_MANY_CHUNK + 5));
    expect(r).toEqual({ embedded: 5, processed: 5, failed: EMBED_MANY_CHUNK, rateLimited: false });
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("treats a skipped (child account) answer as nothing embedded", async () => {
    mocks.invoke.mockResolvedValue(ok({ skipped: "child_account" }));
    expect(await queueEmbeddings("npc", ids(3))).toEqual({ embedded: 0, processed: 0, failed: 3, rateLimited: false });
  });

  it("does not count ids the server refused as handled", async () => {
    mocks.invoke.mockResolvedValue(ok({ embedded: ["id0"], unchanged: ["id1"], forbidden: ["id2", "id3"], notFound: ["id4"] }));
    expect(await queueEmbeddings("npc", ids(5))).toEqual({ embedded: 1, processed: 2, failed: 3, rateLimited: false });
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("reports progress per chunk", async () => {
    mocks.invoke.mockResolvedValue(ok({ embedded: [] }));
    const seen: number[] = [];
    await queueEmbeddings("npc", ids(150), (n) => seen.push(n));
    expect(seen).toEqual([100, 150]);
  });
});

describe("queueEmbeddingsInBackground", () => {
  it("sends nothing for an empty list", () => {
    queueEmbeddingsInBackground("npc", []);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
