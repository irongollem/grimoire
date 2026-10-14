import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useOtherDmNotes } from "./useOtherDmNotes";

const h = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as unknown[], error: null as unknown },
}));

vi.mock("@/lib/supabase", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq"]) {
    builder[m] = (...args: unknown[]) => {
      h.calls.push([m, ...args]);
      return builder;
    };
  }
  // `order` is the last call of the read, so it is where the result arrives.
  builder.order = (...args: unknown[]) => {
    h.calls.push(["order", ...args]);
    return Promise.resolve(h.result);
  };
  return { supabase: { from: () => builder }, getCurrentUser: () => null };
});

vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({
    data: ref([
      { user_id: "u2", display_name: "Jeffrey" },
      { user_id: "u3", display_name: null },
    ]),
  }),
}));

function run(subject: { type: "faction" | "npc" | "hero"; id: string }) {
  let out!: ReturnType<typeof useOtherDmNotes>;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(
    defineComponent({
      setup() {
        out = useOtherDmNotes(() => subject);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] } },
  );
  return out;
}

const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const row = (id: string, user_id: string, content: string | null) => ({
  id, user_id, content, campaign_id: "c1", entity_type: "faction", entity_id: "f1", is_private: true, shared_with_dm: false, written_as_dm: true,
});

describe("useOtherDmNotes", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().user = { id: "u1" } as never;
    useCampaignStore().activeCampaignId = "c1";
    h.calls.length = 0;
    h.result = { data: [], error: null };
  });

  it("scopes the read to the campaign, the entity, DM notes and other authors", async () => {
    run({ type: "faction", id: "f1" });
    await flushPromises();
    expect(h.calls).toContainEqual(["eq", "campaign_id", "c1"]);
    expect(h.calls).toContainEqual(["eq", "entity_id", "f1"]);
    expect(h.calls).toContainEqual(["eq", "written_as_dm", true]);
    expect(h.calls).toContainEqual(["neq", "user_id", "u1"]);
  });

  it("names each author and drops blank notes", async () => {
    h.result = { data: [row("a", "u2", doc("cult")), row("b", "u3", doc("x")), row("c", "u2", null)], error: null };
    const out = run({ type: "faction", id: "f1" });
    await flushPromises();
    expect(out.notes.value.map((n) => n.heading)).toEqual(["Jeffrey's note", "Another DM's note"]);
  });

  it("never reads for a column-kind or app-wide entity", async () => {
    run({ type: "npc", id: "n1" });
    run({ type: "hero", id: "h1" });
    await flushPromises();
    expect(h.calls).toHaveLength(0);
  });
});
