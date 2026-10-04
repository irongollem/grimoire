import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  resetNpcRelationshipSuggestions,
  resolveSuggestionTargets,
  useNpcRelationshipSuggestions,
} from "./useNpcRelationshipSuggestions";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

describe("resolveSuggestionTargets", () => {
  const npcs = [{ id: "n1", name: "Tilda Fenn" }];
  const factions = [{ id: "f1", name: "The Iron Concord" }];

  it("maps names to ids case-insensitively and drops unresolved ones", () => {
    const out = resolveSuggestionTargets(
      [
        { kind: "npc", target_name: "tilda fenn", relationship_type: "ally", notes: "" },
        { kind: "npc", target_name: "Gone", relationship_type: "ally", notes: "" },
        { kind: "faction", target_name: "The Iron Concord", role: "Spy", notes: "" },
        { kind: "faction", target_name: "Tilda Fenn", role: "Spy", notes: "" },
      ],
      npcs,
      factions,
    );
    expect(out.map((s) => s.target_id)).toEqual(["n1", "f1"]);
  });
});

describe("useNpcRelationshipSuggestions per-NPC binding", () => {
  const lookups = {
    npcs: [{ id: "n1", name: "Tilda Fenn" }],
    factions: [],
  };
  const reply = {
    data: {
      suggestions: [
        { kind: "npc", target_name: "Tilda Fenn", relationship_type: "ally", notes: "" },
      ],
      grounded: true,
      ai_provenance: { generated: true },
    },
    error: null,
  };

  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useCampaignStore } = await import("@/stores/campaign");
    useCampaignStore().activeCampaignId = "c1";
    resetNpcRelationshipSuggestions();
    invoke.mockReset();
  });

  it("shows a result only on the NPC it was generated for", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest, forNpc } = useNpcRelationshipSuggestions();
    expect(await suggest("A", "", lookups)).toBe(true);

    expect(forNpc(() => "A").suggestions.value).toHaveLength(1);
    expect(forNpc(() => "A").provenance.value).not.toBeNull();
    expect(forNpc(() => "B").suggestions.value).toEqual([]);
    expect(forNpc(() => "B").provenance.value).toBeNull();
  });

  it("keeps a late result attached to its own NPC", async () => {
    let resolve!: (v: typeof reply) => void;
    invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    const { suggest, forNpc } = useNpcRelationshipSuggestions();
    const pending = suggest("A", "", lookups);

    expect(forNpc(() => "A").isGenerating.value).toBe(true);
    expect(forNpc(() => "B").isGenerating.value).toBe(false);

    resolve(reply);
    await pending;
    expect(forNpc(() => "B").suggestions.value).toEqual([]);
    expect(forNpc(() => "A").suggestions.value).toHaveLength(1);
  });

  it("dismissing on one NPC leaves another NPC's list alone", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest, forNpc } = useNpcRelationshipSuggestions();
    await suggest("A", "", lookups);
    forNpc(() => "B").dismissAll();
    expect(forNpc(() => "A").suggestions.value).toHaveLength(1);
    const a = forNpc(() => "A");
    a.dismiss(a.suggestions.value[0]);
    expect(a.suggestions.value).toEqual([]);
  });

  it("scopes an error to the NPC that asked", async () => {
    invoke.mockResolvedValue({ data: { error: "boom" }, error: null });
    const { suggest, forNpc } = useNpcRelationshipSuggestions();
    await suggest("A", "", lookups);
    expect(forNpc(() => "A").error.value).toBe("boom");
    expect(forNpc(() => "B").error.value).toBeNull();
  });
});
