import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import { canonEntry } from "@/test/canonEntry";

const calls = vi.hoisted(() => ({ made: [] as { mode: string; scope: string | undefined }[], suggest: vi.fn() }));
const canon = vi.hoisted(() => ({ entries: undefined as unknown, party: undefined as unknown }));
const state = vi.hoisted(() => ({
  aiEnabled: true, affordable: true, error: "" as string, count: 3, generating: false,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 3, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: { get value() { return canon.entries; } } }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { get value() { return canon.party; } } }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.generating; } } }));
vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: (mode: string, scope?: string) => {
    calls.made.push({ mode, scope });
    return {
      suggest: (...args: unknown[]) => calls.suggest(mode, ...args),
      suggestions: { get value() { return Array.from({ length: state.count }); } },
      error: { get value() { return state.error || null; } },
    };
  },
}));

const { useCanonSuggestionsAskAdapter, canonModeFor, loreTitleFrom } = await import("./canonSuggestionsAskAdapter");
const { useCanonSuggestionsQuote } = await import("@/composables/ai/quotes/canonSuggestionsQuote");

const proposal = (concept: string, inputs: Record<string, unknown> = {}): AskProposal => ({
  proposalId: "p1", generator: "canon_suggestions", concept, inputs,
});

const secret = canonEntry({ id: "s1", part: "secret", title: "The guildmaster is dead", premise_kind: null });
const lore = canonEntry({ id: "l1", part: "lore", title: "The Fall", lore_kind: "history", premise_kind: null, body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A hundred years ago." }] }] }) });
const force = canonEntry({ id: "f1", part: "force", title: "The Ferrymen", premise_kind: null });

describe("canonModeFor", () => {
  // Bug caught: a request the Canon's own Suggest buttons write was run as the wrong helper (or as truths, the fallback),
  // so the DM paid for suggestions of a kind they did not ask for.
  it.each([
    ['Suggest clues for the secret "The guildmaster is dead".', "clues"],
    ["Suggest open questions for my canon.", "questions"],
    ['Suggest the next steps for the force "The Ferrymen".', "forces"],
    ["Suggest a force for my world, one with a slow plan.", "forces"],
    ["Suggest a secret for my canon, with clues.", "secrets"],
    ["Suggest a premise for my campaign: a pitch, themes and how it plays.", "premise"],
    ['Suggest a passage for the lore "The Fall".', "lore"],
    ["Suggest a piece of lore for my world.", "lore"],
    ["Do my secrets and clues hold together?", "read"],
    ["Read my whole canon for contradictions.", "read"],
    ["Suggest three truths for my canon.", "truths"],
    ["something the guild keeps quiet", "truths"],
    ["the folklore of the valley", "truths"],
    ["Suggest three arcs for my campaign.", "arcs"],
    ["Plan the acts of the story.", "arcs"],
    ["Suggest peoples for my world.", "peoples"],
    ["Who lives in the marsh?", "peoples"],
    ["Which cultures keep the river?", "peoples"],
    ['Suggest a backstory for "Tilda".', "backstory"],
    ["Fill out the field guide with the marsh's creatures.", "species"],
    ["Suggest some plants for my world.", "species"],
    ["Suggest habitats for my world.", "habitats"],
    ["What kinds of country lie east of the river?", "habitats"],
  ] as const)("%s -> %s", (request, mode) => {
    expect(canonModeFor(request)).toBe(mode);
  });

  // Bug caught: the words inside a quoted title were read as the request, so a lore entry called "The Force of Names" ran forces.
  it("reads the request's own words and not the quoted title's", () => {
    expect(canonModeFor('Suggest a passage for the lore "The Force of Names".')).toBe("lore");
    expect(canonModeFor('Suggest clues for the secret "Who asks the question".')).toBe("clues");
  });

  it("titles a lore draft with the first line of the request, cut short", () => {
    expect(loreTitleFrom("The drowned king\nand his court")).toBe("The drowned king");
    expect(loreTitleFrom("x".repeat(200))).toHaveLength(80);
  });
});

describe("useCanonSuggestionsAskAdapter", () => {
  beforeEach(() => {
    calls.made.length = 0;
    calls.suggest.mockReset().mockResolvedValue(true);
    Object.assign(state, { aiEnabled: true, affordable: true, error: "", count: 3, generating: false });
    canon.entries = [secret, lore, force];
    canon.party = [{ id: "pm1", name: "Tilda" }];
  });

  it("quotes the price of the mode it will run and names the chapter the result lands in", () => {
    const adapter = useCanonSuggestionsAskAdapter();
    const quoteFor = useCanonSuggestionsQuote();
    const truths = adapter.quote(proposal("something about the river"));
    expect(truths.total).toBe(quoteFor("truths").total);
    expect(truths.lines[0]).toMatchObject({ label: "Part of the canon", value: "Truths" });
    expect(adapter.quote(proposal("write some lore about the river")).total).toBe(quoteFor("lore").total);
    expect(adapter.quote(proposal("Suggest open questions for my canon.")).lines[0]).toMatchObject({ value: "Secrets and questions" });
    expect(adapter.quote(proposal("Do my secrets and clues hold together?")).lines[0]).toMatchObject({ value: "The whole canon" });
  });

  it("blocks on AI off, a short balance, and an empty or over-long description", () => {
    const adapter = useCanonSuggestionsAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal("a truth")).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal("a truth")).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal("  ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal("x".repeat(5000))).block?.reason).toBe("missing");
  });

  // Bug caught: a quoted title the canon does not hold ran anyway and suggested clues for nothing, spending credits.
  it("fails the quote and the run, with a clear message, for a title the canon does not hold", async () => {
    const adapter = useCanonSuggestionsAskAdapter();
    const request = proposal('Suggest clues for the secret "The lost heir".');
    expect(adapter.quote(request).block).toEqual({ reason: "missing", message: 'There is no secret titled "The lost heir" in your canon.' });
    const result = await adapter.run(request);
    expect(result).toMatchObject({ route: null, parts: [{ ok: false, error: 'There is no secret titled "The lost heir" in your canon.' }] });
    expect(calls.suggest).not.toHaveBeenCalled();
  });

  // Bug caught: clues were asked for with no secret named, so the server refused after the DM had confirmed.
  it("asks which secret when clues are wanted and none is named", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal("Suggest some clues."));
    expect(result.parts[0]).toMatchObject({ ok: false });
    expect(result.parts[0]!.error).toContain("double quotes");
    expect(calls.suggest).not.toHaveBeenCalled();
  });

  // Bug caught: the clues were stored under a key the secret's own review does not read (or one shared by every secret).
  it("runs clues for the named secret, under that secret's key, and ends on the secret", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal('Suggest clues for the secret "the guildmaster is dead".'));
    expect(calls.made).toContainEqual({ mode: "clues", scope: "s1" });
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("clues", 'Suggest clues for the secret "the guildmaster is dead".', { secret_id: "s1" });
    expect(result).toMatchObject({ record: null, route: "/canon/secrets?entry=s1" });
    expect(result.parts).toEqual([{ label: "Three clue suggestions are ready.", ok: true, credits: 3 }]);
  });

  it("splits a named lore entry into passages from its own text, under the entry's key", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal('Suggest a passage for the lore "The Fall".'));
    expect(calls.made).toContainEqual({ mode: "lore", scope: "l1" });
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("lore", expect.any(String), { title: "The Fall", lore_kind: "history", text: "A hundred years ago." });
    expect(result.route).toBe("/canon/lore?entry=l1");
  });

  it("drafts new lore under the new-entry key, with a title from the request, and ends on the Lore chapter", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal("lore of the drowned king"));
    expect(calls.made).toContainEqual({ mode: "lore", scope: "new" });
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("lore", "lore of the drowned king", { title: "lore of the drowned king" });
    expect(result.route).toBe("/canon/lore");
  });

  it("runs the steps of a named force, and a force that is not there fails the run", async () => {
    const ok = await useCanonSuggestionsAskAdapter().run(proposal('Suggest the next steps for the force "The Ferrymen".'));
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("forces", expect.stringContaining("Ferrymen"), undefined);
    expect(ok.route).toBe("/canon/moving");
    const missing = await useCanonSuggestionsAskAdapter().run(proposal('Suggest the next steps for the force "The Tide".'));
    expect(missing.parts[0]).toMatchObject({ ok: false, error: 'There is no force titled "The Tide" in your canon.' });
  });

  it("runs each other helper with the request as the steer and ends on its chapter", async () => {
    const route = async (request: string) => (await useCanonSuggestionsAskAdapter().run(proposal(request))).route;
    expect(await route("Suggest three truths for my canon.")).toBe("/canon/truths");
    expect(await route("Suggest open questions for my canon.")).toBe("/canon/secrets");
    expect(await route("Suggest a secret for my canon, with clues.")).toBe("/canon/secrets");
    expect(await route("Suggest a premise for my campaign: a pitch.")).toBe("/canon/premise");
    expect(calls.suggest.mock.calls.map(([mode]) => mode)).toEqual(["truths", "questions", "secrets", "premise"]);
  });

  // Bug caught: a backstory request ran for no character, or for one the party does not have, and spent credits on nothing.
  it("resolves a backstory's character by name in the party, and fails the quote and run for a name it does not hold", async () => {
    const adapter = useCanonSuggestionsAskAdapter();
    const ok = await adapter.run(proposal('Suggest a backstory for "tilda".'));
    expect(calls.made).toContainEqual({ mode: "backstory", scope: "pm1" });
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("backstory", expect.any(String), { party_member_id: "pm1" });
    expect(ok.route).toBe("/canon/backstories");
    calls.suggest.mockClear();
    const request = proposal('Suggest a backstory for "Gruk".');
    expect(adapter.quote(request).block).toEqual({ reason: "missing", message: 'There is no character named "Gruk" in your party.' });
    expect((await adapter.run(request)).parts[0]).toMatchObject({ ok: false });
    expect((await adapter.run(proposal("Suggest a backstory."))).parts[0]!.error).toContain("double quotes");
    expect(calls.suggest).not.toHaveBeenCalled();
  });

  it("runs arcs and peoples on their own chapters and prices", async () => {
    const adapter = useCanonSuggestionsAskAdapter();
    expect((await adapter.run(proposal("Suggest three arcs."))).route).toBe("/canon/arcs");
    expect((await adapter.run(proposal("Suggest peoples for the marsh."))).route).toBe("/canon/peoples");
    expect(adapter.quote(proposal("Suggest three arcs.")).total).toBe(useCanonSuggestionsQuote()("arcs").total);
  });

  it("a read finds what it finds, and ending with no findings is still a success", async () => {
    state.count = 0;
    const result = await useCanonSuggestionsAskAdapter().run(proposal("Read my whole canon for contradictions."));
    expect(result).toMatchObject({ route: "/canon", parts: [{ label: "The read found nothing to report.", ok: true }] });
  });

  it("returns a failed part, never throws, and has no route when it fails or everything was set aside", async () => {
    calls.suggest.mockResolvedValueOnce(false);
    state.error = "Needs the server";
    const failed = await useCanonSuggestionsAskAdapter().run(proposal("a truth"));
    expect(failed).toMatchObject({ route: null, parts: [{ ok: false, error: "Needs the server" }] });
    state.error = "";
    calls.suggest.mockRejectedValueOnce(new Error("boom"));
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]).toMatchObject({ ok: false, error: "boom" });
    state.count = 0;
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]).toMatchObject({ ok: false });
  });

  it("does not run when blocked or while another generation runs", async () => {
    state.generating = true;
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]!.ok).toBe(false);
    state.generating = false;
    state.aiEnabled = false;
    await useCanonSuggestionsAskAdapter().run(proposal("a truth"));
    expect(calls.suggest).not.toHaveBeenCalled();
  });
});
