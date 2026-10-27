import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// #972: a panel that stays mounted behind a closed lid (the chat, the AI
// generators) runs these hooks on every page. Closed, they must send nothing.

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const ui = vi.hoisted(() => ({ dmPreviewMode: false }));

vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "user-1" }), supabase: fake.client }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ui }));

import { usePlayerItemProjection } from "@/composables/items/useItems";

function run<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

beforeEach(() => {
  fake.reset();
  ui.dmPreviewMode = false;
});

describe("closed panels fetch nothing (#972)", () => {
  it("usePlayerItemProjection with enabled false sends no request, in either mode", async () => {
    run(() => usePlayerItemProjection(() => ({ enabled: false })));
    ui.dmPreviewMode = true;
    run(() => usePlayerItemProjection(() => ({ enabled: false })));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("a player reads the gated projection and never the library or the DM's own table", async () => {
    fake.onRpc("get_player_visible_items", () => [{ id: "i1", name: "Rope" }]);
    fake.seed("items", [{ id: "dm-only", name: "Secret key" }]);
    const items = run(() => usePlayerItemProjection());
    await flushPromises();
    expect(items.data.value?.map((i) => i.id)).toEqual(["i1"]);
    expect(fake.calls.map((c) => c.target)).toEqual(["get_player_visible_items"]);
  });

  it("the DM previewing as a player reads their own items instead, since the projection returns nothing to a non-member", async () => {
    ui.dmPreviewMode = true;
    fake.onRpc("get_player_visible_items", () => []);
    fake.seed("items", [{ id: "dm-item", name: "Lantern" }]);
    const items = run(() => usePlayerItemProjection());
    await flushPromises();
    expect(items.data.value?.map((i) => i.id)).toEqual(["dm-item"]);
    expect(fake.calls.map((c) => c.target)).toEqual(["items"]);
  });
});
