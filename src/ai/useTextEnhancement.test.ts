import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useEnhanceAvailable, useTextEnhancement } from "./useTextEnhancement";

const campaignMock = {
  isAiEnabled: true,
  activeCampaign: { id: "c1", ai_setting_prompt: "Grim north", text_provider: "openai" } as
    | { id: string; ai_setting_prompt: string | null; text_provider: string }
    | null,
};
const authMock = { isDM: true };
const requireCredits = vi.fn((_credits: number, _byok?: boolean) => true);
const generateProseText = vi.fn(async (_request: unknown) => "Rewritten.");

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => authMock }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("./entityTextGeneration", () => ({ generateProseText: (r: unknown) => generateProseText(r) }));

beforeEach(() => {
  campaignMock.isAiEnabled = true;
  campaignMock.activeCampaign = { id: "c1", ai_setting_prompt: "Grim north", text_provider: "openai" };
  authMock.isDM = true;
  requireCredits.mockClear().mockReturnValue(true);
  generateProseText.mockClear();
});

describe("useEnhanceAvailable", () => {
  it("offers Enhance to a DM on credits, with no key of their own (#992)", () => {
    expect(useEnhanceAvailable().value).toBe(true);
  });

  it("hides it when the campaign's AI is off, from players, and without a campaign", () => {
    campaignMock.isAiEnabled = false;
    expect(useEnhanceAvailable().value).toBe(false);
    campaignMock.isAiEnabled = true;
    authMock.isDM = false;
    expect(useEnhanceAvailable().value).toBe(false);
    authMock.isDM = true;
    campaignMock.activeCampaign = null;
    expect(useEnhanceAvailable().value).toBe(false);
  });
});

describe("useTextEnhancement", () => {
  it("charges through the credit gate and sends the selection with its context lines", async () => {
    const { enhance } = useTextEnhancement();
    const out = await enhance({
      selectedText: "He was sad.",
      context: "NPC backstory: Mira",
      styleHint: "Present tense.",
      before: "  The rain fell. ",
      after: "",
    });

    expect(out).toBe("Rewritten.");
    expect(requireCredits).toHaveBeenCalledWith(1, false);
    expect(generateProseText).toHaveBeenCalledWith({
      generator: "text_enhancement",
      campaignId: "c1",
      settingPrompt: "Grim north",
      ruleset: "2024",
      prompt: "He was sad.",
      constraints: [
        "Context: NPC backstory: Mira",
        "Writing style: Present tense.",
        "Text before the selection: The rain fell.",
      ],
    });
  });

  it("returns null and spends nothing when the DM is short of credits", async () => {
    requireCredits.mockReturnValue(false);
    const out = await useTextEnhancement().enhance({ selectedText: "x", context: "note" });
    expect(out).toBeNull();
    expect(generateProseText).not.toHaveBeenCalled();
  });

  it("refuses a selection longer than the server accepts, before charging", async () => {
    await expect(
      useTextEnhancement().enhance({ selectedText: "a".repeat(2001), context: "note" }),
    ).rejects.toThrow("Select at most");
    expect(requireCredits).not.toHaveBeenCalled();
  });

  it("refuses to run when the campaign's AI is off", async () => {
    campaignMock.isAiEnabled = false;
    await expect(useTextEnhancement().enhance({ selectedText: "x", context: "note" })).rejects.toThrow("AI is off");
  });

  it("keeps each context line within the server's 400-character bound", async () => {
    await useTextEnhancement().enhance({ selectedText: "x", context: "c".repeat(900) });
    const [request] = generateProseText.mock.calls[0] as [{ constraints: string[] }];
    expect(request.constraints[0]).toHaveLength(400);
  });
});
