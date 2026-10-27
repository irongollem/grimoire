import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { checkRateLimit } from "./rate-limit";

const fake = createSupabaseFake();
// The fake implements the slice of the client this module calls.
const admin = fake.client as unknown as SupabaseClient;

beforeEach(() => fake.reset());

describe("checkRateLimit", () => {
  it("allows a request only when the database gate explicitly allows it", async () => {
    fake.onRpc("check_rate_limit", () => true);
    await expect(checkRateLimit(admin, "user-1", "ai_generation")).resolves.toBe(true);
    fake.onRpc("check_rate_limit", () => false);
    await expect(checkRateLimit(admin, "user-1", "ai_generation")).resolves.toBe(false);
  });

  it("treats an answer that is not a boolean true as a refusal", async () => {
    fake.onRpc("check_rate_limit", () => null);
    await expect(checkRateLimit(admin, "user-1", "ai_generation")).resolves.toBe(false);
    fake.onRpc("check_rate_limit", () => "true");
    await expect(checkRateLimit(admin, "user-1", "ai_generation")).resolves.toBe(false);
  });

  it("fails closed when the database gate is unavailable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.onRpc("check_rate_limit", () => true);
    fake.failNext("check_rate_limit", { message: "offline" });
    await expect(checkRateLimit(admin, "user-1", "ai_generation")).resolves.toBe(false);
    spy.mockRestore();
  });

  it("counts the event against the user it was asked about, spending one unit unless the caller says more", async () => {
    const seen: Record<string, unknown>[] = [];
    fake.onRpc("check_rate_limit", (args) => {
      seen.push(args);
      return true;
    });

    await checkRateLimit(admin, "user-1", "bug_report");
    await checkRateLimit(admin, "user-2", "ai_generation", 4);

    expect(seen[0]).toMatchObject({ p_user_id: "user-1", p_action: "bug_report", p_cost: 1 });
    expect(seen[1]).toMatchObject({ p_user_id: "user-2", p_action: "ai_generation", p_cost: 4 });
  });
});
