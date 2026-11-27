import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const suggest = vi.hoisted(() => vi.fn(async () => true));
const helperFor = vi.hoisted(() => vi.fn());
const skipAsync = vi.hoisted(() => vi.fn(async () => {}));
const walkSteps = vi.hoisted(() => ({ value: [] as { id: string; state: string }[] }));
const gate = vi.hoisted(() => ({ message: null as string | null }));

vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: (mode: string, scope: string) => {
    helperFor(mode, scope);
    return { suggest, error: ref<string | null>("the helper's own words") };
  },
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: ref(false) }));
vi.mock("@/ai/ask/useAskGate", () => ({ useAskGate: () => ({ blockFor: () => (gate.message === null ? null : { reason: "credits", message: gate.message }) }) }));
vi.mock("@/composables/ai/quotes/canonSuggestionsQuote", () => ({ useCanonSuggestionsQuote: () => (mode: string) => ({ lines: [], total: mode === "premise" ? 3 : 5 }) }));
vi.mock("@/composables/canon/useCanonWalkSteps", () => ({ useCanonWalkSteps: () => ({ stops: ref([]), steps: { get value() { return walkSteps.value; } }, loaded: ref(true) }) }));
vi.mock("@/composables/canon/useWalkWrites", () => ({ useWalkWrites: () => ({ write: vi.fn() }) }));
vi.mock("@/composables/canon/useCanonWalkSkips", () => ({ useCanonWalkSkipActions: () => ({ skip: { mutateAsync: skipAsync } }) }));

import { useAskWalkPorts } from "./useAskWalkPorts";
import type { WalkDraft, WalkStopRef } from "@/lib/canon/canonWalk";

const stop = (over: Partial<WalkStopRef> = {}): WalkStopRef => ({ step: "themes", memberId: null, memberName: null, ...over });
const request = (draft: WalkDraft, over: { stop?: WalkStopRef; answer?: string } = {}) =>
  useAskWalkPorts().draft({ draft, scope: "walk", steer: "the steer", answer: over.answer ?? "", stop: over.stop ?? stop() });

describe("useAskWalkPorts", () => {
  beforeEach(() => {
    suggest.mockClear().mockResolvedValue(true);
    helperFor.mockClear();
    gate.message = null;
  });

  // Bug caught: a premise step drafting all premise kinds because `kinds` was not sent, rewriting fields the DM skipped.
  it("sends a premise step's kinds with the steer", async () => {
    await request({ mode: "premise", kinds: ["line", "veil"] });
    expect(suggest).toHaveBeenCalledWith("the steer", { kinds: ["line", "veil"] });
  });

  // Bug caught: a character's backstory draft sent without the character, so the server drafts for nobody.
  it("sends the character's id for a backstory", async () => {
    await request({ mode: "backstory" }, { stop: stop({ step: "backstories", memberId: "m1", memberName: "Ada" }) });
    expect(suggest).toHaveBeenCalledWith("the steer", { party_member_id: "m1" });
    expect(helperFor).toHaveBeenCalledWith("backstory", "walk");
  });

  // Bug caught: a backstory section stop (no character) calling the helper with no one to write about.
  it("will not draft a backstory without a character", async () => {
    expect(await request({ mode: "backstory" }, { stop: stop({ step: "backstories" }) })).toMatchObject({ ok: false });
    expect(suggest).not.toHaveBeenCalled();
  });

  // Bug caught: a lore draft with an empty title (the server's input for it), or one titled with the steer sentence.
  it("titles a lore draft from the DM's own first line, and asks for one when there is none", async () => {
    await request({ mode: "lore" }, { answer: "The Drowning\nhow it went under" });
    expect(suggest).toHaveBeenCalledWith("the steer", { title: "The Drowning" });
    suggest.mockClear();
    expect(await request({ mode: "lore" }, { answer: "" })).toMatchObject({ ok: false });
    expect(suggest).not.toHaveBeenCalled();
  });

  // Bug caught: a failed helper (false) reported as a draft ready, or its error replaced by a generic line.
  it("reports the helper's own error when it fails", async () => {
    suggest.mockResolvedValue(false);
    expect(await request({ mode: "truths" })).toEqual({ ok: false, error: "the helper's own words" });
  });

  // Bug caught: the Field guide or Habitats step falling through to no helper (the switch missing its case), or sending
  // the premise's kinds with them.
  it.each(["species", "habitats"] as const)("drafts %s through its own helper with only the steer", async (mode) => {
    expect(await request({ mode })).toEqual({ ok: true });
    expect(helperFor).toHaveBeenCalledWith(mode, "walk");
    expect(suggest).toHaveBeenCalledWith("the steer");
  });

  // Bug caught: Habitats judged to have species by any step being filled (or by the wrong step), so its draft is
  // offered with an empty guide.
  it("reads the field guide's own step for whether a species is kept", () => {
    const ports = useAskWalkPorts();
    walkSteps.value = [{ id: "peoples", state: "filled" }, { id: "species", state: "todo" }];
    expect(ports.speciesKept()).toBe(false);
    walkSteps.value = [{ id: "peoples", state: "todo" }, { id: "species", state: "filled" }];
    expect(ports.speciesKept()).toBe(true);
  });

  // Bug caught: the price read from the wrong mode's row (a character's draft priced as the premise).
  it("prices a step by its own mode", () => {
    const ports = useAskWalkPorts();
    expect(ports.price({ mode: "premise", kinds: ["theme"] })).toBe(3);
    expect(ports.price({ mode: "truths" })).toBe(5);
  });

  // Bug caught: the gate's refusal lost, so a short balance reads as allowed.
  it("passes the gate's message through, and null when it allows", () => {
    const ports = useAskWalkPorts();
    expect(ports.blockedBy(5)).toBeNull();
    gate.message = "short";
    expect(ports.blockedBy(5)).toBe("short");
  });

  // Bug caught: a skip that resolves without reaching the mutation (the section would be asked again next visit).
  it("stores a skip through the mutation", async () => {
    await useAskWalkPorts().skip("truths");
    expect(skipAsync).toHaveBeenCalledWith("truths");
  });
});
