import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchPlayerBookNook } from "./usePlayerBookNook";

beforeEach(() => fake.reset());

describe("fetchPlayerBookNook", () => {
  it("asks for the place by id and returns the nook", async () => {
    fake.onRpc("get_player_book_nook", (args) => (args.p_location_id === "p1" ? [{ id: "n1" }] : []));
    expect(await fetchPlayerBookNook("p1")).toMatchObject({ id: "n1" });
  });

  it("is null for a place that shows no nook", async () => {
    fake.onRpc("get_player_book_nook", () => []);
    expect(await fetchPlayerBookNook("p2")).toBeNull();
  });

  it("throws the error instead of reading it as no nook", async () => {
    fake.failNext("get_player_book_nook", { message: "not allowed" });
    await expect(fetchPlayerBookNook("p1")).rejects.toMatchObject({ message: "not allowed" });
  });
});
