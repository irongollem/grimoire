import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

function clientReturning(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as never;
}

describe("checkRateLimit", () => {
  it("allows a request only when the database gate explicitly allows it", async () => {
    await expect(checkRateLimit(clientReturning({ data: true, error: null }), "user-1", "ai_generation"))
      .resolves.toBe(true);
    await expect(checkRateLimit(clientReturning({ data: false, error: null }), "user-1", "ai_generation"))
      .resolves.toBe(false);
  });

  it("fails closed when the database gate is unavailable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(checkRateLimit(clientReturning({ data: null, error: { message: "offline" } }), "user-1", "ai_generation"))
      .resolves.toBe(false);
    spy.mockRestore();
  });
});
