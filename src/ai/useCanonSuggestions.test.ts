// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { resetCanonSuggestions, useCanonSuggestions } from "./useCanonSuggestions";

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

  it("surfaces a server error as the run's error and keeps no proposals", async () => {
    invoke.mockResolvedValueOnce({ data: { error: "rate_limited" }, error: null });
    const truths = useCanonSuggestions("truths");
    expect(await truths.suggest("")).toBe(false);
    expect(truths.error.value).toBe("rate_limited");
    expect(truths.suggestions.value).toEqual([]);
  });

  // Bug caught: a section's "Enhance with AI" asked for the whole starter because `kinds` never left the client.
  it("sends the premise's kinds with the pitch, and none when the whole starter is asked for", async () => {
    invoke.mockResolvedValue(reply([{ kind: "theme", text: "Mercy" }]));
    await useCanonSuggestions("premise", "themes").suggest("kind folk", { kinds: ["theme"] });
    expect(invoke).toHaveBeenLastCalledWith("suggest-canon", { body: { campaign_id: "c1", mode: "premise", prompt: "kind folk", kinds: ["theme"] } });
    await useCanonSuggestions("premise").suggest("kind folk");
    expect(invoke.mock.calls.at(-1)![1].body).not.toHaveProperty("kinds");
  });

  // Bug caught: a backstory request went without its character, so the server could not tell whose past it was.
  it("sends the character with a backstory request, and holds the proposals under that character", async () => {
    invoke.mockResolvedValueOnce(reply([{ title: "The fire", body: "x" }]));
    const helper = useCanonSuggestions("backstory", "pm1");
    await helper.suggest("", { party_member_id: "pm1" });
    expect(invoke).toHaveBeenLastCalledWith("suggest-canon", { body: { campaign_id: "c1", mode: "backstory", prompt: "", party_member_id: "pm1" } });
    expect(useCanonSuggestions("backstory", "pm2").suggestions.value).toEqual([]);
  });

  // Bug caught: a walk draft sent like a chapter's Suggest, so the server never asked for range and a DM who wrote little
  // got one proposal back; or a chapter's Suggest asking for walk range it did not want.
  it("asks for range only for a draft held under a walk scope", async () => {
    invoke.mockResolvedValue(reply([{ title: "The sea is salt", knowledge: "all", knowers: [] }]));
    await useCanonSuggestions("truths", "walk:truths").suggest("salt");
    expect(invoke.mock.calls.at(-1)![1].body).toMatchObject({ walk: true });
    await useCanonSuggestions("truths").suggest("salt");
    expect(invoke.mock.calls.at(-1)![1].body).not.toHaveProperty("walk");
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

  describe("kept proposals (#1282)", () => {
    const truths = async () => {
      invoke.mockResolvedValueOnce(reply([{ title: "A", knowledge: "all", knowers: [] }, { title: "B", knowledge: "all", knowers: [] }]));
      const review = useCanonSuggestions("truths");
      await review.suggest("");
      return review;
    };

    // Bug caught: the kept state lived in one component, so the walk's block and a chapter on the same key disagreed.
    it("is shared by every review on one key and never leaks to another key", async () => {
      const first = await truths();
      const [a] = first.suggestions.value;
      first.markKept(a!, { undo: null });
      const second = useCanonSuggestions("truths");
      expect(second.isKept(a!)).toBe(true);
      expect(useCanonSuggestions("truths", "walk:truths").isKept(a!)).toBe(false);
    });

    // Bug caught: undo returned the row to pending before the write was reversed (or when it failed), so Accept wrote a duplicate.
    it("runs the undo, then returns the proposal to pending; a failed undo leaves it kept", async () => {
      const review = await truths();
      const [a, b] = review.suggestions.value;
      const undo = vi.fn().mockRejectedValueOnce(new Error("no")).mockResolvedValueOnce(undefined);
      review.markKept(a!, { undo });
      review.markKept(b!, { undo: null });
      await expect(review.undoKept(a!)).rejects.toThrow("no");
      expect(review.isKept(a!)).toBe(true);
      await review.undoKept(a!);
      expect(review.isKept(a!)).toBe(false);
      expect(review.isKept(b!)).toBe(true);
      expect(review.canUndo(b!)).toBe(false);
    });
  });
});
