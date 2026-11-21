import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("./vault.ts", () => ({
  decryptValue: async (blob: string) => {
    if (blob === "bad") throw new Error("does not decrypt");
    return `plain:${blob}`;
  },
}));

import { fetchPlatformKeys } from "./platform-keys.ts";

function adminAnswering(result: { data: unknown; error: unknown }): SupabaseClient {
  return { from: () => ({ select: () => ({ in: () => Promise.resolve(result) }) }) } as unknown as SupabaseClient;
}

describe("fetchPlatformKeys", () => {
  // Callers fall back on a missing key (a campaign's BYOK key, the feature off), so a failed read must not fail the
  // request; but it must be logged, or a database error reads as "the admin never set a key".
  it("answers no keys on a failed read, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchPlatformKeys(adminAnswering({ data: null, error: new Error("timeout") }), ["elevenlabs"])).resolves.toEqual({});
    expect(log).toHaveBeenCalledWith(expect.stringContaining("platform_api_keys"), "timeout");
    log.mockRestore();
  });

  // A rotated VAULT_KEY: Admin shows the key as Set, so the log is the only place that says why it is not used.
  it("drops a key that does not decrypt, keeps the rest, and names the provider in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = adminAnswering({ data: [{ provider: "elevenlabs", encrypted_key: "a" }, { provider: "inworld", encrypted_key: "bad" }], error: null });
    await expect(fetchPlatformKeys(admin, ["elevenlabs", "inworld"])).resolves.toEqual({ elevenlabs: "plain:a" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("inworld"));
    expect(String(log.mock.calls[0])).not.toContain("bad");
    log.mockRestore();
  });
});
