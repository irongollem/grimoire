import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useOtherDmNotes } from "./useOtherDmNotes";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => null }));

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
    fake.reset();
    setActivePinia(createPinia());
    useAuthStore().user = { id: "u1" } as never;
    useCampaignStore().activeCampaignId = "c1";
  });

  it("returns only co-DMs' DM-written notes on this entity in this campaign (never my own, a player's, or another entity's)", async () => {
    fake.seed("entity_notes", [
      row("co", "u2", doc("cult")),
      { ...row("mine", "u1", doc("mine")) },
      { ...row("player", "u3", doc("player note")), written_as_dm: false },
      { ...row("elsewhere", "u2", doc("other campaign")), campaign_id: "c2" },
      { ...row("other-entity", "u2", doc("other faction")), entity_id: "f2" },
      { ...row("other-type", "u2", doc("an npc")), entity_type: "npc" },
    ]);
    const out = run({ type: "faction", id: "f1" });
    await flushPromises();
    expect(out.notes.value.map((n) => n.id)).toEqual(["co"]);
  });

  it("names each author and drops notes that are null or an empty document", async () => {
    fake.seed("entity_notes", [row("a", "u2", doc("cult")), row("b", "u3", doc("x")), row("c", "u2", null),
      row("d", "u2", JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })),
    ]);
    const out = run({ type: "faction", id: "f1" });
    await flushPromises();
    expect(out.notes.value.map((n) => n.heading)).toEqual(["Jeffrey's note", "Another DM's note"]);
  });

  it("never reads for a column-kind or app-wide entity", async () => {
    run({ type: "npc", id: "n1" });
    run({ type: "hero", id: "h1" });
    await flushPromises();
    expect(fake.calls).toHaveLength(0);
  });
});
