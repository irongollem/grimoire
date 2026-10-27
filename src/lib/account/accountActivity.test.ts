import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const report = vi.fn();
vi.mock("../supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("../observability/sentry", () => ({ reportHandledError: (...a: unknown[]) => report(...a) }));

import { resetAccountActivityThrottle, touchAccountActivity } from "./accountActivity";

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  rpc.mockReset();
  report.mockReset();
  rpc.mockResolvedValue({ error: null });
  resetAccountActivityThrottle();
});

describe("touchAccountActivity", () => {
  it("calls the RPC once, then not again within the hour", () => {
    touchAccountActivity("u1", 0);
    touchAccountActivity("u1", HOUR - 1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("calls again after an hour", () => {
    touchAccountActivity("u1", 0);
    touchAccountActivity("u1", HOUR);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("throttles per user", () => {
    touchAccountActivity("u1", 0);
    touchAccountActivity("u2", 1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reports an RPC error without throwing, and lets the next event retry", async () => {
    const failure = { message: "boom" };
    rpc.mockResolvedValueOnce({ error: failure });
    expect(() => touchAccountActivity("u1", 0)).not.toThrow();
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(failure, "accountActivity:touch"));
    touchAccountActivity("u1", 1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected call, and lets the next event retry", async () => {
    const failure = new Error("offline");
    rpc.mockRejectedValueOnce(failure);
    touchAccountActivity("u1", 0);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(failure, "accountActivity:touch"));
    touchAccountActivity("u1", 1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
