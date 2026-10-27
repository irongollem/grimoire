import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { registerImageProvenance } from "./register";
import type { AiProvenance } from "./types";

const PROV: AiProvenance = {
  generatorType: "npc_portrait",
  provider: "gemini",
  model: "gemini-3.1-flash-image",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

const fake = createSupabaseFake();
// The fake implements the slice of the client this module calls.
const admin = fake.client as unknown as SupabaseClient;

beforeEach(() => fake.reset());

describe("registerImageProvenance", () => {
  it("records the owner and provenance against the image's stem", async () => {
    await registerImageProvenance(admin, "npc-portraits", "u1/portrait-abc.webp", "u1", PROV);
    expect(fake.rows("image_provenance")).toEqual([
      { bucket: "npc-portraits", stem: "u1/portrait-abc", user_id: "u1", provenance: PROV },
    ]);
  });

  it("registering a size variant of an image updates the original's row instead of adding a second", async () => {
    await registerImageProvenance(admin, "npc-portraits", "u1/portrait-abc.webp", "u1", PROV);
    await registerImageProvenance(admin, "npc-portraits", "u1/portrait-abc_w400.webp", "u1", { ...PROV, edited: true });
    const rows = fake.rows("image_provenance");
    expect(rows).toHaveLength(1);
    expect(rows[0].provenance).toMatchObject({ edited: true });
  });

  it("keeps the same stem in two buckets apart", async () => {
    await registerImageProvenance(admin, "npc-portraits", "u1/a.webp", "u1", PROV);
    await registerImageProvenance(admin, "mini-models", "u1/a.webp", "u1", PROV);
    expect(fake.rows("image_provenance")).toHaveLength(2);
  });

  it("throws a database error", async () => {
    fake.failNext("image_provenance", { message: "boom" });
    await expect(registerImageProvenance(admin, "mini-models", "u1/m/style.webp", "u1", PROV)).rejects.toMatchObject({
      message: "boom",
    });
  });
});
