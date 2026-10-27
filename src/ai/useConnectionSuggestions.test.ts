// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { resetConnectionSuggestions, useConnectionSuggestions } from "./useConnectionSuggestions";
import { ref } from "vue";
import { registerAiGenerator } from "./aiGeneratorRegistry";
import { LOCAL_MODE_KEY } from "@/lib/localKeyVault";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

const A = { kind: "npc", id: "A" } as const;
const B = { kind: "npc", id: "B" } as const;
const itemA = { kind: "item", id: "A" } as const;

const reply = {
  data: {
    suggestions: [
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", target_id: "d1", type: "worships", subject_is_from: true, notes: "" },
    ],
    grounded: true,
    ai_provenance: { generated: true },
  },
  error: null,
};

describe("useConnectionSuggestions", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useCampaignStore } = await import("@/stores/campaign");
    useCampaignStore().activeCampaignId = "c1";
    resetConnectionSuggestions();
    invoke.mockReset();
    localStorage.clear();
  });

  it("refuses in local-key mode, naming why, without calling the server", async () => {
    localStorage.setItem(LOCAL_MODE_KEY, "local");
    const { useCampaignStore } = await import("@/stores/campaign");
    useCampaignStore().decryptedAnthropicKey = "sk-ant";
    const { suggest, forSubject } = useConnectionSuggestions();

    expect(await suggest(A, "")).toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(forSubject(() => A).error.value).toContain("local-key mode");
  });

  it("clears the previous result while a new run for the same subject is in flight", async () => {
    invoke.mockResolvedValueOnce(reply);
    const { suggest, forSubject } = useConnectionSuggestions();
    await suggest(A, "");
    expect(forSubject(() => A).suggestions.value).toHaveLength(1);

    let resolve!: (v: typeof reply) => void;
    invoke.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const second = suggest(A, "again");
    expect(forSubject(() => A).suggestions.value).toEqual([]);
    resolve(reply);
    await second;
    expect(forSubject(() => A).suggestions.value).toHaveLength(1);
  });

  it("asks the function for the subject's kind and id, with the steer trimmed", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest } = useConnectionSuggestions();
    await suggest({ kind: "faction", id: "F" }, "  someone with a grudge ");
    expect(invoke).toHaveBeenCalledWith("suggest-connections", {
      body: { campaign_id: "c1", subject_kind: "faction", subject_id: "F", prompt: "someone with a grudge" },
    });
  });

  it("shows a result only on the subject it was generated for", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest, forSubject } = useConnectionSuggestions();
    expect(await suggest(A, "")).toBe(true);

    expect(forSubject(() => A).suggestions.value).toHaveLength(1);
    expect(forSubject(() => A).provenance.value).not.toBeNull();
    expect(forSubject(() => B).suggestions.value).toEqual([]);
    expect(forSubject(() => B).provenance.value).toBeNull();
  });

  it("keeps two kinds with the same id apart", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest, forSubject } = useConnectionSuggestions();
    await suggest(A, "");
    expect(forSubject(() => itemA).suggestions.value).toEqual([]);
  });

  it("keeps a late result attached to its own subject", async () => {
    let resolve!: (v: typeof reply) => void;
    invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    const { suggest, forSubject } = useConnectionSuggestions();
    const pending = suggest(A, "");

    expect(forSubject(() => A).isGenerating.value).toBe(true);
    expect(forSubject(() => B).isGenerating.value).toBe(false);

    resolve(reply);
    await pending;
    expect(forSubject(() => B).suggestions.value).toEqual([]);
    expect(forSubject(() => A).suggestions.value).toHaveLength(1);
  });

  it("dismissing on one subject leaves another's list alone", async () => {
    invoke.mockResolvedValue(reply);
    const { suggest, forSubject } = useConnectionSuggestions();
    await suggest(A, "");
    forSubject(() => B).dismissAll();
    expect(forSubject(() => A).suggestions.value).toHaveLength(1);
    const a = forSubject(() => A);
    a.dismiss(a.suggestions.value[0]);
    expect(a.suggestions.value).toEqual([]);
  });

  it("passes the set-aside claims through and accepts a reply of only those", async () => {
    const setAside = [{ target_name: "Weir Chapel", claim: "The Ferry Bell is kept at Weir Chapel", reason: "Brenna carries it" }];
    invoke.mockResolvedValue({ data: { suggestions: [], setAside, grounded: true, ai_provenance: null }, error: null });
    const { suggest, forSubject } = useConnectionSuggestions();
    expect(await suggest(A, "")).toBe(true);
    expect(forSubject(() => A).setAside.value).toEqual(setAside);
    expect(forSubject(() => B).setAside.value).toEqual([]);
    forSubject(() => A).dismissAll();
    expect(forSubject(() => A).setAside.value).toEqual([]);
  });

  it("fails on a reply with nothing in it", async () => {
    invoke.mockResolvedValue({ data: { suggestions: [], grounded: true, ai_provenance: null }, error: null });
    const { suggest, forSubject } = useConnectionSuggestions();
    expect(await suggest(A, "")).toBe(false);
    expect(forSubject(() => A).error.value).toBe("No usable suggestions. Try again.");
  });

  it("scopes an error to the subject that asked", async () => {
    invoke.mockResolvedValue({ data: { error: "boom" }, error: null });
    const { suggest, forSubject } = useConnectionSuggestions();
    await suggest(A, "");
    expect(forSubject(() => A).error.value).toBe("boom");
    expect(forSubject(() => B).error.value).toBeNull();
  });

  it("does not start while another generation is running", async () => {
    // The registry is module-level and has no unregister; this runs last so the busy entry touches nothing else.
    registerAiGenerator({
      isGenerating: ref(true), error: ref(null), concept: ref(""), completedEntityId: ref(null), clearCompleted: () => {},
      label: "Busy", entityRoute: () => "/", openPanel: () => {},
    } as unknown as Parameters<typeof registerAiGenerator>[0]);
    const { suggest } = useConnectionSuggestions();
    expect(await suggest(A, "")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
