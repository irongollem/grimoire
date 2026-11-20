import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "lotte" }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), fromError: (e: Error) => e.message } }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: "m1" }) }));

const world = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/composables/canon/usePlayerCanon", async () => {
  const { computed } = await import("vue");
  return { usePlayerCanon: () => ({ world: computed(() => world.value), isLoading: computed(() => false), error: computed(() => null) }) };
});
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([{ id: "m1", name: "Tansy" }, { id: "m2", name: "Pim" }, { id: "m3", name: "Sift" }]) }),
}));

import { updateMyPassage, useMyStory } from "./useMyStory";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignStore } from "@/stores/campaign";

function run() {
  let result!: ReturnType<typeof useMyStory>;
  const Host = defineComponent({
    setup() {
      result = useMyStory();
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }]] } });
  return result;
}

describe("useMyStory: Add to my story", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useCampaignStore().activeCampaignId = "c1";
    world.value = { onlyMine: [], known: [], lore: [], backstories: [] };
    fake.onRpc("open_backstory", () => "entry-new");
  });

  // Bug caught: the passage was inserted before the entry existed (a player cannot write canon_entries), so a player's
  // first passage was refused by the database.
  it("opens the backstory first and hangs the passage off the entry it answered, written by the player", async () => {
    const story = run();
    story.add.mutate({ shareWithParty: true });
    await flushPromises();
    expect(fake.rows("canon_lore_passages")).toMatchObject([{ entry_id: "entry-new", author_id: "lotte", user_id: "lotte", campaign_id: "c1" }]);
  });

  it("writes nothing when the entry could not be opened", async () => {
    fake.failNext("open_backstory", { message: "Not authorized" });
    const story = run();
    story.add.mutate({ shareWithParty: true });
    await flushPromises();
    expect(fake.rows("canon_lore_passages")).toEqual([]);
  });

  // Bug caught: the toggle off still told the whole party, or the toggle on left the writer's own character out.
  it("tells the whole party when shared, and only their own character when not", async () => {
    const story = run();
    story.add.mutate({ shareWithParty: true });
    await flushPromises();
    story.add.mutate({ shareWithParty: false });
    await flushPromises();
    const [shared, privateOne] = fake.rows("canon_lore_passages");
    expect(shared?.player_visible_to).toEqual(["m1", "m2", "m3"]);
    expect(privateOne?.player_visible_to).toEqual(["m1"]);
  });

  it("puts the new passage after the ones the player already reads", async () => {
    world.value = { onlyMine: [], known: [], lore: [], backstories: [{ entry: { id: "entry-new" }, memberId: "m1", passages: [{ id: "p", sort_order: 4 }], latestDmAt: null }] };
    const story = run();
    story.add.mutate({ shareWithParty: false });
    await flushPromises();
    expect(fake.rows("canon_lore_passages")[0]?.sort_order).toBe(5);
  });

  // Bug caught: a DM previewing a player wrote a passage under their own name into the player's story.
  it("is read-only while a DM previews a player", () => {
    useAppUiStore().dmPreviewMode = true;
    expect(run().readOnly.value).toBe(true);
  });
});

describe("updateMyPassage", () => {
  beforeEach(() => fake.reset());

  it("saves the heading and text of a passage the player wrote", async () => {
    fake.seed("canon_lore_passages", [{ id: "g1", title: "", body: null }]);
    await updateMyPassage("g1", { title: "After the Mere", body: "x" });
    expect(fake.rows("canon_lore_passages")[0]).toMatchObject({ title: "After the Mere", body: "x" });
  });

  // Bug caught: RLS refuses a write with no error and no row, so editing a passage the DM wrote read as "Saved".
  it("says so when the write changed no row, which is what RLS refusing it looks like", async () => {
    await expect(updateMyPassage("not-mine", { title: "x", body: null })).rejects.toThrow("may not change");
  });
});
