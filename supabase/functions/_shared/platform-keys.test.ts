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
  // Answering {} on a failed read would run every caller on its no-key path: voices silently off, judging skipped.
  it("throws when the read fails instead of reporting no keys", async () => {
    await expect(fetchPlatformKeys(adminAnswering({ data: null, error: new Error("timeout") }), ["elevenlabs"])).rejects.toThrow("timeout");
  });

  it("drops a key that does not decrypt and keeps the rest", async () => {
    const admin = adminAnswering({ data: [{ provider: "elevenlabs", encrypted_key: "a" }, { provider: "inworld", encrypted_key: "bad" }], error: null });
    await expect(fetchPlatformKeys(admin, ["elevenlabs", "inworld"])).resolves.toEqual({ elevenlabs: "plain:a" });
  });
});
