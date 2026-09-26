import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

const { invokeTilePackGenerator } = await import("./tilePackGenerator");

beforeEach(() => invoke.mockReset());

/**
 * What supabase-js resolves with when the function answers non-2xx: `data` is
 * null and the JSON body is the unread Response on `error.context`. The first
 * version of these tests put the body in `data`, which supabase-js never does,
 * so they passed while every real refusal reached the UI as the generic string.
 */
function refusal(body: Record<string, unknown>, status = 409) {
  return {
    data: null,
    error: {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    },
  };
}

describe("invokeTilePackGenerator", () => {
  it("returns the payload when the call succeeds", async () => {
    invoke.mockResolvedValue({ data: { run_id: "r1", total_jobs: 20 }, error: null });
    await expect(invokeTilePackGenerator({ action: "generate_library_pack" }))
      .resolves.toEqual({ run_id: "r1", total_jobs: 20 });
  });

  it("prefers the body's error code over the transport message", async () => {
    // The function answers a refusal with BOTH a 4xx and a JSON body; the
    // transport message is the useless half.
    invoke.mockResolvedValue(refusal({ error: "generation_already_running" }));
    await expect(invokeTilePackGenerator({})).rejects.toThrow("generation_already_running");
  });

  it("falls back to the transport message when the body carries no code", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await expect(invokeTilePackGenerator({})).rejects.toThrow("Failed to fetch");
  });

  it("falls back to the transport message when the runtime's reply is not JSON", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response("worker limit", { status: 546 }) },
    });
    await expect(invokeTilePackGenerator({})).rejects.toThrow("Edge Function returned a non-2xx status code");
  });

  it("throws on an error body even when the transport reports success", async () => {
    invoke.mockResolvedValue({ data: { error: "admin_required" }, error: null });
    await expect(invokeTilePackGenerator({})).rejects.toThrow("admin_required");
  });

  /**
   * The regression this file exists for. `describeLibraryPackError` turns
   * `pack_incomplete` into "6 required slots are still blank" — but only if
   * the counts reach it. A `new Error(code)` drops them, and a test that
   * builds the error object by hand passes regardless, so the assertion has
   * to be made here, over the function that actually constructs it.
   */
  it("carries the refusal body's extra fields onto the Error", async () => {
    invoke.mockResolvedValue(refusal({ error: "pack_incomplete", required: 20, requiredDrawn: 14 }));

    const caught = await invokeTilePackGenerator({}).catch((failure: unknown) => failure);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("pack_incomplete");
    expect(caught).toMatchObject({ required: 20, requiredDrawn: 14 });
  });

  it("does not copy the error code itself onto the Error as a field", async () => {
    invoke.mockResolvedValue({ data: { error: "pack_incomplete", required: 20 }, error: null });
    const caught = await invokeTilePackGenerator({}).catch((failure: unknown) => failure);
    expect((caught as Record<string, unknown>).error).toBeUndefined();
  });
});
