import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  categoriesOverThreshold,
  isNearThreshold,
  screenImagePrompt,
  recordScreeningOutcome,
  isPromptRejected,
  PromptRejectedError,
  IMAGE_PROMPT_THRESHOLDS,
  PROMPT_TEXT_BAND,
} from "./moderation.ts";

/**
 * Minimal stand-in for the two Supabase chains this module uses:
 *   .from(t).insert(row).select("id").single()
 *   .from(t).update(patch).eq("id", id)
 * It records what was written, which is the only thing worth asserting — the
 * privacy rule is "what lands in the row", not "what was computed".
 */
function fakeAdmin() {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: unknown; patch: Record<string, unknown> }> = [];
  const admin = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "row-1" }, error: null }) }) };
        },
        update(patch: Record<string, unknown>) {
          return { eq: (_col: string, id: unknown) => { updates.push({ id, patch }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, inserts, updates };
}

function context(admin: SupabaseClient, apiKey: string | null = "sk-test") {
  return { apiKey, admin, userId: "user-1", generationType: "entity_image", imageProvider: "openai" };
}

/**
 * Real `category_scores` from omni-moderation-latest, 16 Sep 2026, recorded so
 * the threshold table is tested against what the model actually says rather
 * than against numbers invented to suit it.
 *
 * `apiFlagged` is the endpoint's own verdict and is here to be contradicted:
 * seven of these eight are flagged, and seven of the eight must pass. That gap
 * is the entire reason this module exists, so it is asserted rather than
 * described — see the header comment in moderation.ts.
 */
const MEASURED: Array<{ label: string; apiFlagged: boolean; scores: Record<string, number> }> = [
  { label: "a stern dwarven cleric in plate armor, painted portrait", apiFlagged: false,
    scores: { "violence": 0.001, "violence/graphic": 0.000, "illicit": 0.000, "sexual": 0.000, "sexual/minors": 0.000, "hate": 0.000 } },
  { label: "a blood-soaked barbarian cleaving an orc, entrails visible", apiFlagged: true,
    scores: { "violence": 0.765, "violence/graphic": 0.852, "illicit": 0.005, "sexual": 0.000, "sexual/minors": 0.000, "hate": 0.000 } },
  { label: "a tiefling rogue slitting a guard's throat, blood spray", apiFlagged: true,
    scores: { "violence": 0.866, "violence/graphic": 0.847, "illicit": 0.008, "sexual": 0.000, "sexual/minors": 0.000, "hate": 0.000 } },
  { label: "a torture chamber, prisoner on the rack, screaming", apiFlagged: true,
    scores: { "violence": 0.517, "violence/graphic": 0.203, "illicit": 0.020, "sexual": 0.003, "sexual/minors": 0.000, "hate": 0.001 } },
  { label: "an orc warlord rallying troops to exterminate the elves", apiFlagged: true,
    scores: { "violence": 0.559, "violence/graphic": 0.009, "illicit": 0.020, "sexual": 0.000, "sexual/minors": 0.000, "hate": 0.001 } },
  { label: "a succubus in scanty ornate armor, alluring pose", apiFlagged: true,
    scores: { "violence": 0.001, "violence/graphic": 0.000, "illicit": 0.000, "sexual": 0.778, "sexual/minors": 0.000, "hate": 0.000 } },
  { label: "a drow assassin brewing poison to murder the duke", apiFlagged: true,
    scores: { "violence": 0.639, "violence/graphic": 0.009, "illicit": 0.177, "sexual": 0.000, "sexual/minors": 0.000, "hate": 0.000 } },
  // The control, and the only one that must be refused.
  { label: "explicit pornographic sex scene between two adults", apiFlagged: true,
    scores: { "violence": 0.001, "violence/graphic": 0.000, "illicit": 0.000, "sexual": 0.926, "sexual/minors": 0.000, "hate": 0.000 } },
];

const PORN_CONTROL = MEASURED[MEASURED.length - 1];

describe("categoriesOverThreshold — the policy, against measured scores", () => {
  it("passes every legitimate D&D prompt the API itself flags", () => {
    const wrongly = MEASURED.slice(0, -1)
      .filter((m) => categoriesOverThreshold(m.scores).length > 0)
      .map((m) => m.label);
    expect(wrongly).toEqual([]);
  });

  it("still refuses the explicit control", () => {
    expect(categoriesOverThreshold(PORN_CONTROL.scores)).toEqual(["sexual"]);
  });

  it("contradicts the endpoint's own flag on six of the seven it passes", () => {
    // Guards the premise: if the recorded set ever stops containing prompts
    // the API flags and we allow, this suite has stopped testing anything.
    const flaggedButAllowed = MEASURED.slice(0, -1).filter(
      (m) => m.apiFlagged && categoriesOverThreshold(m.scores).length === 0,
    );
    expect(flaggedButAllowed).toHaveLength(6);
  });

  it("never gates on violence, however graphic", () => {
    for (const category of ["violence", "violence/graphic", "illicit", "illicit/violent", "harassment"]) {
      expect(IMAGE_PROMPT_THRESHOLDS[category]).toBeUndefined();
    }
    expect(categoriesOverThreshold({ "violence": 1, "violence/graphic": 1, "illicit": 1 })).toEqual([]);
  });

  it("holds the sexual/minors line far below every other threshold", () => {
    expect(categoriesOverThreshold({ "sexual/minors": 0.25 })).toEqual(["sexual/minors"]);
  });

  it("treats a category the response omits as unjudged, not as zero", () => {
    // Every threshold category absent: nothing to judge, so nothing blocked —
    // and, crucially, no throw from reading undefined.
    expect(categoriesOverThreshold({ "violence": 0.9 })).toEqual([]);
  });
});

describe("isNearThreshold — the prompt-text privacy rule", () => {
  it("is false for an ordinary prompt, so its text is never stored", () => {
    expect(isNearThreshold(MEASURED[0].scores)).toBe(false);
  });

  it("is false for graphic violence, which scores high on no gated category", () => {
    expect(isNearThreshold(MEASURED[2].scores)).toBe(false);
  });

  it("is true only within the band below a threshold", () => {
    const threshold = IMAGE_PROMPT_THRESHOLDS["sexual"];
    expect(isNearThreshold({ "sexual": threshold - PROMPT_TEXT_BAND - 0.01 })).toBe(false);
    expect(isNearThreshold({ "sexual": threshold - PROMPT_TEXT_BAND + 0.01 })).toBe(true);
  });

  it("leaves the succubus text unstored at 0.778, well under the 0.85 band floor", () => {
    expect(isNearThreshold(MEASURED[5].scores)).toBe(false);
  });
});

describe("screenImagePrompt", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubModeration(body: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("calls the free model and returns the log row id on an acceptable prompt", async () => {
    const fetchMock = stubModeration({ results: [{ category_scores: MEASURED[0].scores }] });
    const { admin, inserts } = fakeAdmin();

    await expect(screenImagePrompt("a dwarven cleric", context(admin))).resolves.toEqual({ id: "row-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "omni-moderation-latest",
      input: "a dwarven cleric",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      user_id: "user-1", generation_type: "entity_image", image_provider: "openai", blocked: false,
    });
  });

  it("logs the full score vector and the thresholds in force, not just the gated five", () => {
    // The row has to answer "would a different gate have helped?" later, which
    // a five-category slice cannot.
    stubModeration({ results: [{ category_scores: MEASURED[2].scores }] });
    const { admin, inserts } = fakeAdmin();

    return screenImagePrompt("…", context(admin)).then(() => {
      expect(inserts[0].scores).toEqual(MEASURED[2].scores);
      expect(inserts[0].thresholds).toEqual(IMAGE_PROMPT_THRESHOLDS);
    });
  });

  it("does NOT store the prompt text for an ordinary pass", async () => {
    stubModeration({ results: [{ category_scores: MEASURED[2].scores }] });
    const { admin, inserts } = fakeAdmin();

    await screenImagePrompt("a tiefling rogue slitting a guard's throat", context(admin));

    expect(inserts[0].prompt).toBeNull();
  });

  it("stores the prompt text for a near-miss", async () => {
    stubModeration({ results: [{ category_scores: { "sexual": IMAGE_PROMPT_THRESHOLDS["sexual"] - 0.01 } }] });
    const { admin, inserts } = fakeAdmin();

    await screenImagePrompt("a borderline prompt", context(admin));

    expect(inserts[0].prompt).toBe("a borderline prompt");
  });

  it("logs the block BEFORE throwing, and keeps the text", async () => {
    stubModeration({ results: [{ category_scores: PORN_CONTROL.scores }] });
    const { admin, inserts } = fakeAdmin();

    await expect(screenImagePrompt("explicit …", context(admin))).rejects.toBeInstanceOf(PromptRejectedError);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ blocked: true, categories_over: ["sexual"], prompt: "explicit …" });
  });

  it("throws PromptRejectedError carrying the categories, without leaking them to the DM", async () => {
    stubModeration({ results: [{ category_scores: PORN_CONTROL.scores }] });
    const { admin } = fakeAdmin();

    const error = await screenImagePrompt("…", context(admin)).catch((e) => e);
    expect(isPromptRejected(error)).toBe(true);
    expect(error.categories).toEqual(["sexual"]);
    expect(error.message).not.toContain("sexual");
  });

  it("skips entirely, without a fetch, when no screening key exists", async () => {
    const fetchMock = stubModeration({ results: [{ category_scores: PORN_CONTROL.scores }] });
    const { admin, inserts } = fakeAdmin();

    await expect(screenImagePrompt("…", context(admin, null))).resolves.toEqual({ id: null });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("fails OPEN when the model is not enabled on the account", async () => {
    // The 404 an account whose project restricts models would get. Rendering
    // must continue: the renderer's own moderation is the safety boundary.
    stubModeration({ error: { message: "The model `omni-moderation-latest` does not exist" } }, false, 404);
    const { admin, inserts } = fakeAdmin();

    await expect(screenImagePrompt("a dwarven cleric", context(admin))).resolves.toEqual({ id: null });
    expect(inserts).toHaveLength(0);
  });

  it("fails OPEN when the endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { admin } = fakeAdmin();

    await expect(screenImagePrompt("a dwarven cleric", context(admin))).resolves.toEqual({ id: null });
  });

  it("fails OPEN when the response carries no scores", async () => {
    stubModeration({ results: [{}] });
    const { admin } = fakeAdmin();

    await expect(screenImagePrompt("a dwarven cleric", context(admin))).resolves.toEqual({ id: null });
  });

  it("renders even if logging the screening fails", async () => {
    stubModeration({ results: [{ category_scores: MEASURED[0].scores }] });
    const admin = {
      from: () => ({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }),
      }),
    } as unknown as SupabaseClient;

    await expect(screenImagePrompt("a dwarven cleric", context(admin))).resolves.toEqual({ id: null });
  });
});

describe("recordScreeningOutcome", () => {
  it("stamps the verdict on the row", async () => {
    const { admin, updates } = fakeAdmin();

    await recordScreeningOutcome(admin, "row-1", "rendered");

    expect(updates).toEqual([{ id: "row-1", patch: { provider_outcome: "rendered" } }]);
  });

  it("keeps the prompt text when the renderer refused something we allowed", async () => {
    const { admin, updates } = fakeAdmin();

    await recordScreeningOutcome(admin, "row-1", "refused", "a prompt we waved through");

    expect(updates[0].patch).toEqual({ provider_outcome: "refused", prompt: "a prompt we waved through" });
  });

  it("does not store text for a plain error — that row is evidence of nothing", async () => {
    const { admin, updates } = fakeAdmin();

    await recordScreeningOutcome(admin, "row-1", "error", "a prompt");

    expect(updates[0].patch).toEqual({ provider_outcome: "error" });
  });

  it("never throws when the write fails", async () => {
    const admin = {
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: "boom" } }) }) }),
    } as unknown as SupabaseClient;

    await expect(recordScreeningOutcome(admin, "row-1", "rendered")).resolves.toBeUndefined();
  });
});
