import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
  getCurrentUser: () => ({ id: "dm-1" }),
}));

import { createNpcFavor, deleteNpcFavor, settleNpcFavor, useNpcFavors, useSettleNpcFavor } from "./useNpcFavors";

function mountWith<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return out;
}

const input = { campaign_id: "c1", npc_id: "npc-1", quest_id: null, text: "A debt of honor", source_event_id: null };

beforeEach(() => fake.reset());

describe("favors an NPC is owed", () => {
  it("lists one NPC's favors, settled and unsettled, oldest first, and no other NPC's", async () => {
    fake.seed("npc_favors", [
      { id: "f2", npc_id: "npc-1", created_at: "2026-02-01", settled_at: null },
      { id: "f1", npc_id: "npc-1", created_at: "2026-01-01", settled_at: "2026-03-01" },
      { id: "f3", npc_id: "npc-2", created_at: "2026-01-15", settled_at: null },
    ]);
    const query = mountWith(() => useNpcFavors("npc-1"));
    await flushPromises();
    expect(query.data.value?.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("stamps the current user as created_by when none is given, and keeps an explicit one", async () => {
    await createNpcFavor(input);
    await createNpcFavor({ ...input, text: "x", created_by: "other-user" });
    expect(fake.rows("npc_favors")).toMatchObject([{ created_by: "dm-1" }, { created_by: "other-user" }]);
  });

  it("surfaces an insert failure", async () => {
    fake.failNext("npc_favors", { message: "insert failed" });
    await expect(createNpcFavor(input)).rejects.toMatchObject({ message: "insert failed" });
  });

  it("settling stamps settled_at on that favor only and keeps the row", async () => {
    fake.seed("npc_favors", [
      { id: "f1", npc_id: "npc-1", settled_at: null },
      { id: "f2", npc_id: "npc-1", settled_at: null },
    ]);
    await settleNpcFavor("f1");
    const [f1, f2] = fake.rows("npc_favors");
    expect(typeof f1?.settled_at).toBe("string");
    expect(f2?.settled_at).toBeNull();
  });

  it("refreshes the NPC's favor list after settling", async () => {
    fake.seed("npc_favors", [{ id: "f1", npc_id: "npc-1", created_at: "2026-01-01", settled_at: null }]);
    const { list, settle } = mountWith(() => ({ list: useNpcFavors("npc-1"), settle: useSettleNpcFavor() }));
    await flushPromises();
    expect(list.data.value?.[0]?.settled_at).toBeNull();
    await settle.mutateAsync({ id: "f1", npcId: "npc-1" });
    await flushPromises();
    expect(list.data.value?.[0]?.settled_at).not.toBeNull();
  });

  it("deletes only the favor named, and surfaces a delete failure", async () => {
    fake.seed("npc_favors", [{ id: "f1", npc_id: "npc-1" }, { id: "f2", npc_id: "npc-1" }]);
    await deleteNpcFavor("f1");
    expect(fake.rows("npc_favors").map((f) => f.id)).toEqual(["f2"]);
    fake.failNext("npc_favors", { message: "delete failed" });
    await expect(deleteNpcFavor("f2")).rejects.toMatchObject({ message: "delete failed" });
  });
});
