import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerImageProvenance } from "./register";
import type { AiProvenance } from "./types";

const PROV: AiProvenance = {
  generatorType: "npc_portrait",
  provider: "gemini",
  model: "gemini-3.1-flash-image",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

interface Call {
  table: string;
  row: Record<string, unknown>;
  options: Record<string, unknown>;
}

function fakeAdmin(error: { message: string } | null = null): { admin: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          calls.push({ table, row, options });
          return Promise.resolve({ error });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe("registerImageProvenance", () => {
  it("upserts the stem, bucket, owner and provenance on the conflict key", async () => {
    const { admin, calls } = fakeAdmin();
    await registerImageProvenance(admin, "npc-portraits", "u1/portrait-abc.webp", "u1", PROV);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("image_provenance");
    expect(calls[0].row).toEqual({ bucket: "npc-portraits", stem: "u1/portrait-abc", user_id: "u1", provenance: PROV });
    expect(calls[0].options).toEqual({ onConflict: "bucket,stem" });
  });

  it("collapses a variant-looking path to its original's stem", async () => {
    const { admin, calls } = fakeAdmin();
    await registerImageProvenance(admin, "npc-portraits", "u1/portrait-abc_w400.webp", "u1", PROV);
    expect(calls[0].row.stem).toBe("u1/portrait-abc");
  });

  it("throws a database error", async () => {
    const { admin } = fakeAdmin({ message: "boom" });
    await expect(registerImageProvenance(admin, "mini-models", "u1/m/style.webp", "u1", PROV)).rejects.toEqual({ message: "boom" });
  });
});
