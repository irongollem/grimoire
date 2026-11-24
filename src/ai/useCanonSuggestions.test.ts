// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { resetCanonSuggestions, useCanonSuggestions } from "./useCanonSuggestions";
import { LOCAL_MODE_KEY } from "@/lib/localKeyVault";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

const reply = (suggestions: unknown[]) => ({ data: { suggestions, ai_provenance: { generated: true } }, error: null });

describe("useCanonSuggestions", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useCampaignStore } = await import("@/stores/campaign");
    useCampaignStore().activeCampaignId = "c1";
    resetCanonSuggestions();
    invoke.mockReset();
    localStorage.clear();
  });

  it("sends the mode and the pitch for the campaign, and holds the proposals without writing anything", async () => {
    invoke.mockResolvedValueOnce(reply([{ kind: "theme", text: "Mercy" }]));
    const premise = useCanonSuggestions("premise");
    expect(await premise.suggest("  a drowned kingdom ")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("suggest-canon", { body: { campaign_id: "c1", mode: "premise", prompt: "a drowned kingdom" } });
    expect(premise.suggestions.value).toEqual([{ kind: "theme", text: "Mercy" }]);
  });

  it("keeps the premise's and the truths' proposals apart, so a truth can never be offered as a premise entry", async () => {
    invoke.mockResolvedValueOnce(reply([{ kind: "theme", text: "Mercy" }]));
    invoke.mockResolvedValueOnce(reply([{ title: "The sea is salt", knowledge: "all", knowers: [] }]));
    const premise = useCanonSuggestions("premise");
    const truths = useCanonSuggestions("truths");
    await premise.suggest("p");
    await truths.suggest("");
    expect(premise.suggestions.value).toHaveLength(1);
    expect(truths.suggestions.value).toHaveLength(1);
    truths.dismissAll();
    expect(premise.suggestions.value).toHaveLength(1);
  });

  it("dismiss removes only that proposal, and dismiss all clears the run", async () => {
    invoke.mockResolvedValueOnce(reply([{ kind: "theme", text: "A" }, { kind: "theme", text: "B" }]));
    const premise = useCanonSuggestions("premise");
    await premise.suggest("p");
    premise.dismiss(premise.suggestions.value[0]);
    expect(premise.suggestions.value.map((s) => s.text)).toEqual(["B"]);
    premise.dismissAll();
    expect(premise.suggestions.value).toEqual([]);
  });

  it("refuses in local-key mode without calling the server", async () => {
    localStorage.setItem(LOCAL_MODE_KEY, "local");
    const { useCampaignStore } = await import("@/stores/campaign");
    useCampaignStore().decryptedAnthropicKey = "sk-ant";
    const truths = useCanonSuggestions("truths");
    expect(await truths.suggest("")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(truths.error.value).toContain("local-key mode");
  });

  it("surfaces a server error as the run's error and keeps no proposals", async () => {
    invoke.mockResolvedValueOnce({ data: { error: "rate_limited" }, error: null });
    const truths = useCanonSuggestions("truths");
    expect(await truths.suggest("")).toBe(false);
    expect(truths.error.value).toBe("rate_limited");
    expect(truths.suggestions.value).toEqual([]);
  });

  it("sends the secret with a clues request and the title, kind and text with a lore request", async () => {
    invoke.mockResolvedValueOnce(reply([{ title: "c", spot: { kind: "npc", id: "n", name: "N" } }]));
    invoke.mockResolvedValueOnce(reply([{ title: "Lore", kind: "history", passages: [] }]));
    await useCanonSuggestions("clues").suggest(" steer ", { secret_id: "s1" });
    expect(invoke).toHaveBeenLastCalledWith("suggest-canon", { body: { campaign_id: "c1", mode: "clues", prompt: "steer", secret_id: "s1" } });
    await useCanonSuggestions("lore").suggest("", { title: "The Sinking", lore_kind: "legend", text: "old words" });
    expect(invoke).toHaveBeenLastCalledWith("suggest-canon", {
      body: { campaign_id: "c1", mode: "lore", prompt: "", title: "The Sinking", lore_kind: "legend", text: "old words" },
    });
  });

  it("keeps each of the six helpers' proposals apart", async () => {
    invoke.mockResolvedValueOnce(reply([{ title: "Why?" }]));
    invoke.mockResolvedValueOnce(reply([{ title: "Force" }]));
    const questions = useCanonSuggestions("questions");
    const forces = useCanonSuggestions("forces");
    await questions.suggest("");
    await forces.suggest("");
    forces.dismissAll();
    expect(questions.suggestions.value).toEqual([{ title: "Why?" }]);
    expect(forces.suggestions.value).toEqual([]);
  });

  // Bug caught: a read that found nothing was treated as "No usable suggestions" and thrown, so a clean canon could
  // never be told from a failed run.
  it("holds an empty read as a result, where an empty suggester reply is a failure", async () => {
    invoke.mockResolvedValueOnce({ data: { suggestions: [], setAside: [], ai_provenance: { generated: true } }, error: null });
    const read = useCanonSuggestions("read");
    expect(read.hasResult.value).toBe(false);
    expect(await read.suggest("")).toBe(true);
    expect(read.hasResult.value).toBe(true);
    expect(read.suggestions.value).toEqual([]);
    expect(invoke).toHaveBeenCalledWith("suggest-canon", { body: { campaign_id: "c1", mode: "read", prompt: "" } });

    invoke.mockResolvedValueOnce({ data: { suggestions: [], setAside: [], ai_provenance: null }, error: null });
    const secrets = useCanonSuggestions("secrets");
    expect(await secrets.suggest("")).toBe(false);
    expect(secrets.error.value).toContain("No usable suggestions");
  });
});
