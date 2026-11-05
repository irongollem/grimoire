// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h, nextTick, ref } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchPlayerBookNook, usePlayerBookNook } from "./usePlayerBookNook";

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

describe("usePlayerBookNook", () => {
  it("reads again when the same place switches to another nook", async () => {
    const calls: string[] = [];
    fake.onRpc("get_player_book_nook", () => {
      calls.push("read");
      return [{ id: "n" }];
    });
    const nookId = ref<string | null>("n1");
    const app = createApp(defineComponent({ setup() { usePlayerBookNook("p1", nookId); return () => h("div"); } }));
    app.use(VueQueryPlugin, { queryClient: new QueryClient() });
    app.mount(document.createElement("div"));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    nookId.value = "n2";
    await nextTick();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
  });
});
