import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ costOf: vi.fn((_key: string, opts?: { size?: string }) => (opts?.size === "1024x1536" ? 15 : 10)) }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/ai/useEntityImageGeneration", () => ({ useEntityImageGeneration: () => ({ generate: vi.fn(), error: ref(null) }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: mocks.costOf }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ imageCredits: (n: number) => n, imageIsByok: ref(false) }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: () => true }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useUpdateNpc: () => ({}) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({}) }));
vi.mock("@/composables/monsters/useMonsters", () => ({ useUpdateMonster: () => ({}) }));
vi.mock("@/composables/items/useItems", () => ({ useUpdateItem: () => ({}) }));
vi.mock("@/composables/spells/useSpells", () => ({ useUpdateSpell: () => ({}) }));

const { useMissingPortrait } = await import("./useMissingPortrait");

/** The size the retry's edge function paints and bills at, read from the function so the two cannot drift. */
function serverEntityImageSize(): string {
  const source = readFileSync("supabase/functions/generate-entity-image/index.ts", "utf8");
  const found = /const ENTITY_IMAGE_SIZE = "(\d+x\d+)"/.exec(source);
  if (!found) throw new Error("ENTITY_IMAGE_SIZE not found in generate-entity-image");
  return found[1];
}

describe("useMissingPortrait cost", () => {
  // The retry paints through `generate-entity-image`, which renders every kind at one size, spells included. The image
  // job's own table (`PURPOSE_CONFIG`, spell at 1024x1024) prices the first paint, not this one, so pricing a retry
  // from it would quote a spell picture below what is charged.
  it.each(["npc", "party", "monster", "item", "spell"] as const)("prices a %s retry at the size the retry function paints", (kind) => {
    mocks.costOf.mockClear();
    expect(useMissingPortrait(kind).cost.value).toBe(15);
    expect(mocks.costOf).toHaveBeenCalledWith("entity_image", { size: serverEntityImageSize() });
  });
});
