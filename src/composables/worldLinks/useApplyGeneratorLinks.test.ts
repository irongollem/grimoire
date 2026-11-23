import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const store = reactive({ activeCampaignId: "camp-1" as string | null });
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (e: unknown) => (e instanceof Error ? e.message : "failed") }) }));

const { useApplyGeneratorLinks } = await import("./useApplyGeneratorLinks");

function apply() {
  let result!: ReturnType<typeof useApplyGeneratorLinks>;
  mount(
    defineComponent({ setup() { result = useApplyGeneratorLinks(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }]] } },
  );
  return result.applyGeneratorLinks;
}

function choiceOf(subject: "npc", other: "npc" | "deity" | "location", key: string, subjectIsFrom: boolean): TypeChoice {
  const found = typeChoices(subject, other).find((c) => c.key === key && c.subjectIsFrom === subjectIsFrom);
  if (!found) throw new Error(`no ${key} between ${subject} and ${other}`);
  return found;
}
const link = (kind: GeneratorLink["kind"], id: string, name: string, choice: TypeChoice): GeneratorLink => ({ kind, id, name, choice });
const NEW_NPC = { kind: "npc", id: "new" } as const;

beforeEach(() => {
  fake.reset();
  store.activeCampaignId = "camp-1";
});

describe("applyGeneratorLinks", () => {
  // Bug caught: the new record written at the wrong end ("Auril worships Wren").
  it("stores a tie from the new record when the choice reads from it (worships)", async () => {
    const errors = await apply()(NEW_NPC, [link("deity", "d1", "Auril", choiceOf("npc", "deity", "worships", true))], "camp-1");
    expect(errors).toEqual([]);
    expect(fake.rows("world_links")).toMatchObject([{ from_kind: "npc", from_npc_id: "new", to_kind: "deity", to_deity_id: "d1", type: "worships", campaign_id: "camp-1" }]);
  });

  // Bug caught: "apprentice of" written as the new NPC mentoring the master.
  it("stores a tie to the new record when it is the stored `to` end (apprentice of)", async () => {
    await apply()(NEW_NPC, [link("npc", "m1", "Brenna", choiceOf("npc", "npc", "mentor_of", false))], "camp-1");
    expect(fake.rows("world_links")).toMatchObject([{ from_kind: "npc", from_npc_id: "m1", to_kind: "npc", to_npc_id: "new", type: "mentor_of" }]);
  });

  it("writes into the campaign it was given, not whichever is active now", async () => {
    store.activeCampaignId = "camp-2";
    await apply()(NEW_NPC, [link("deity", "d1", "Auril", choiceOf("npc", "deity", "worships", true))], "camp-1");
    expect(fake.rows("world_links")).toMatchObject([{ campaign_id: "camp-1" }]);
  });

  // Bug caught: one failed tie threw, so the saved record's other ties were never written and the page lost the NPC's outcome.
  it("reports a failed tie by name and still writes the others, without throwing", async () => {
    fake.failNext("world_links", { message: "denied" });
    const errors = await apply()(NEW_NPC, [
      link("deity", "d1", "Auril", choiceOf("npc", "deity", "worships", true)),
      link("location", "l1", "The Docks", choiceOf("npc", "location", "works_at", true)),
    ], "camp-1");
    expect(errors).toEqual(["Auril: denied"]);
    expect(fake.rows("world_links")).toMatchObject([{ to_location_id: "l1", type: "works_at" }]);
  });
});
