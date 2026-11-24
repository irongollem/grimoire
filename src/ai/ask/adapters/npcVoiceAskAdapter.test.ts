import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { Npc } from "@/types/npc.types";

const mocks = vi.hoisted(() => ({ suggest: vi.fn(), createMemory: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, affordable: true, npc: undefined as unknown, npcError: null as Error | null,
  coach: { lines: [] as string[], reveals: [] as boolean[], error: null as string | null },
  running: true, log: [] as { id: string; started_at: string | null; played_on: string | null }[],
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (base: number) => base * 3 }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpc: () => ({ data: { get value() { return state.npc; } }, error: { get value() { return state.npcError; } } }),
}));
vi.mock("@/composables/npcs/useNpcMemories", () => ({ useCreateNpcMemory: () => ({ mutateAsync: mocks.createMemory }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  useCampaignSession: () => ({ session: ref({ id: "run-1" }), isRunning: { get value() { return state.running; } } }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: { get value() { return state.log; } } }) }));
vi.mock("@/ai/useNpcVoiceCoach", () => ({
  useNpcVoiceCoach: () => ({
    suggest: mocks.suggest,
    lines: { get value() { return state.coach.lines; } },
    reveals: { get value() { return state.coach.reveals; } },
    error: { get value() { return state.coach.error; } },
    provenance: { value: { generatorType: "npc_voice", provider: "openai", model: "m", generatedAt: "t", edited: false } },
  }),
}));

const { useNpcVoiceAskAdapter } = await import("./npcVoiceAskAdapter");
const { useNpcVoiceQuote } = await import("@/composables/ai/quotes/npcVoiceQuote");

const ID = "11111111-1111-4111-8111-111111111111";
const npc = (over: Partial<Npc> = {}) => ({ id: ID, campaign_id: "camp-1", name: "Johnny Reed", disguise_name: null, disguise_portrait_url: null, is_revealed: true, ...over }) as Npc;
const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "npc_voice", concept: "The guard stops him at the gate", inputs: {}, target: { type: "npc", id: ID, name: "Johnny Reed" }, ...over,
});

async function previewed(p = proposal()) {
  const outcome = await useNpcVoiceAskAdapter().preview(p);
  if (!outcome.ok) throw new Error(`expected a preview: ${outcome.result.parts[0].error}`);
  return outcome.preview;
}

describe("useNpcVoiceAskAdapter", () => {
  beforeEach(() => {
    mocks.suggest.mockReset().mockResolvedValue(undefined);
    mocks.createMemory.mockReset().mockResolvedValue({});
    Object.assign(state, { aiEnabled: true, affordable: true, npc: npc(), npcError: null, running: true, log: [] });
    state.coach = { lines: ["The gate shuts at dusk.", "  Move along.  ", "I never saw you."], reveals: [false, true, false], error: null };
  });

  it("quotes the coach's price, for the NPC the card was opened on", () => {
    const quote = useNpcVoiceAskAdapter().quote(proposal());
    expect(quote.total).toBe(useNpcVoiceQuote()().total);
    expect(quote.lines[0]).toEqual({ label: "For", value: "Johnny Reed", credits: null });
  });

  // Bug caught: a card with no NPC to speak for, from words that named nobody, offering a button that cannot work.
  it("blocks with no NPC named, an NPC that is not the campaign's, and one still being read", () => {
    const adapter = useNpcVoiceAskAdapter();
    expect(adapter.quote(proposal({ target: undefined })).block?.message).toBe("Say whose voice first.");
    state.npc = null;
    expect(adapter.quote(proposal()).block?.message).toBe("That NPC is not in this campaign.");
    state.npc = undefined;
    expect(adapter.quote(proposal()).block?.message).toBe("Still reading that NPC.");
    state.npcError = new Error("db");
    expect(adapter.quote(proposal()).block?.message).toBe("That NPC could not be read.");
  });

  it("blocks with AI off, a short balance, and an empty or overlong situation, and asks the coach nothing", async () => {
    const adapter = useNpcVoiceAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({ concept: " " })).block?.message).toBe("Say what is happening first.");
    expect(adapter.quote(proposal({ concept: "x".repeat(501) })).block?.reason).toBe("missing");
    expect((await adapter.preview(proposal({ concept: " " }))).ok).toBe(false);
    expect(mocks.suggest).not.toHaveBeenCalled();
  });

  // Bug caught: a disguised NPC named by their real name on a card the table can see.
  it("names a disguised NPC by the name they wear", () => {
    state.npc = npc({ disguise_name: "Old Tam", disguise_portrait_url: "d.webp", is_revealed: false });
    expect(useNpcVoiceAskAdapter().quote(proposal()).lines[0].value).toBe("Old Tam");
  });

  it("asks the coach with the NPC and the situation trimmed, and holds its lines with the price as their part", async () => {
    const preview = await previewed(proposal({ concept: "  The guard stops him at the gate  " }));
    expect(mocks.suggest).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), "The guard stops him at the gate");
    expect(preview.parts).toEqual([{ label: "Lines", ok: true, credits: 3 }]);
    expect(preview.shown.sections[0].rows.map((r) => r.detail)).toEqual(["The gate shuts at dusk.", "  Move along.  ", "I never saw you."]);
  });

  const said = (preview: Awaited<ReturnType<typeof previewed>>, i: number) => {
    const action = preview.shown.sections[0].rows[i].action;
    if (!action) throw new Error("expected a row action");
    return action;
  };

  // Bug caught: Done filing lines nobody pressed Said it on, where the coach kept only the ones marked.
  it("gives each line its own Said it, and keeps nothing until one is pressed", async () => {
    const preview = await previewed();
    expect(preview.shown.sections[0].rows.map((r) => r.action?.label)).toEqual(["Said it", "Said it", "Said it"]);
    expect(preview.shown.sections[0].rows.some((r) => r.choice)).toBe(false);
    const refused = await preview.create();
    expect(refused.record).toBeNull();
    expect(refused.parts[0].error).toBe("Press Said it on a line first, or Discard.");
    expect(mocks.createMemory).not.toHaveBeenCalled();
  });

  // Bug caught: the disguise caution lost, so a line that gives the NPC away read like any other.
  it("warns once about the lines the disguise check flagged, and about no other", async () => {
    expect((await previewed()).shown.note).toBe("Line 2 may give the disguise away.");
    state.coach.reveals = [false, false, false];
    expect((await previewed()).shown.note).toBeUndefined();
    state.coach.reveals = [true, false, true];
    expect((await previewed()).shown.note).toBe("Lines 1, 3 may give the disguise away.");
  });

  // Bug caught: a line filed to the wrong NPC, visible to players, outside the running session, or without its provenance.
  it("files the line pressed, and only it, as a DM-only revealed memory of the NPC in the running session", async () => {
    const preview = await previewed();
    expect(await said(preview, 1).run()).toMatchObject({ ok: true });
    expect(mocks.createMemory).toHaveBeenCalledTimes(1);
    expect(mocks.createMemory).toHaveBeenCalledWith({
      memory: expect.objectContaining({
        npc_id: ID, kind: "revealed", body: "Move along.", session_id: "run-1", party_member_ids: [], player_visible_to: [],
        ai_provenance: expect.objectContaining({ generatorType: "npc_voice" }),
      }),
      npcLabel: "Johnny Reed",
    });
    expect(await preview.create()).toMatchObject({ record: { type: "npc", id: ID }, route: `/npcs/${ID}`, parts: [{ ok: true, label: "1 line kept in their Memory tab" }] });
  });

  // Bug caught: with no session running, a line filed to no session, where the coach filed it to the last one played.
  it("files to the last session played when none is running", async () => {
    state.running = false;
    state.log = [{ id: "s2", started_at: null, played_on: null }, { id: "s1", started_at: "t", played_on: null }];
    await said(await previewed(), 0).run();
    expect(mocks.createMemory).toHaveBeenCalledWith(expect.objectContaining({ memory: expect.objectContaining({ session_id: "s1" }) }));
  });

  // Bug caught: a second press on a line filing it twice, or a failed save leaving the line unpressable.
  it("files a line once, and lets a failed save be pressed again", async () => {
    const preview = await previewed();
    mocks.createMemory.mockRejectedValueOnce(new Error("db down"));
    expect(await said(preview, 0).run()).toMatchObject({ ok: false, error: "Could not be kept: db down" });
    expect(await said(preview, 0).run()).toMatchObject({ ok: true });
    expect(await said(preview, 0).run()).toMatchObject({ ok: true });
    expect(mocks.createMemory).toHaveBeenCalledTimes(2);
  });

  it("ends with the coach's reason and no preview when no line comes back", async () => {
    state.coach = { lines: [], reveals: [], error: "AI returned no usable dialogue. Please try again." };
    const outcome = await useNpcVoiceAskAdapter().preview(proposal());
    expect(outcome).toMatchObject({ ok: false, result: { record: null, parts: [{ ok: false, error: "AI returned no usable dialogue. Please try again." }] } });
  });
});
