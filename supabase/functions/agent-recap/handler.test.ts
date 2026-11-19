import { describe, expect, it } from "vitest";
import type { AgentUsage, CallModel } from "../_shared/agent/types";
import type { StoredTurn } from "../_shared/agent/transcript";
import { RECAP_MESSAGES, tellSitting, type RecapDeps, type RecapNote } from "./handler";

const NOTE = "00000000-0000-4000-8000-0000000000a1";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const DM = "dm";
const usage: AgentUsage = { provider: "openai", model: "m1", inputTokens: 2000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 };

const turns: StoredTurn[] = [
  { seq: 1, role: "user", blocks: [{ type: "text", text: "The player sent this as something their character does:\nI open the workshop door.", player: { kind: "do", text: "I open the workshop door." } }] },
  { seq: 2, role: "assistant", blocks: [{ type: "tool_call", id: "r1", name: "roll", input: { expression: "1d20", hidden: true } }] },
  { seq: 3, role: "user", blocks: [{ type: "tool_result", callId: "r1", content: '{"hidden":true,"total":3,"note":"THE-SECRET-ROLL"}', isError: false }] },
  { seq: 4, role: "assistant", blocks: [{ type: "text", text: "The hinge pins had been drawn and set back the wrong way round." }] },
  { seq: 5, role: "user", blocks: [{ type: "text", text: "The player asks you, the Dungeon Master, this out of character:\nIs the thief the mayor?", player: { kind: "ask", text: "Is the thief the mayor?" } }] },
];

function harness(over: Partial<RecapNote> = {}) {
  const h = {
    note: { id: NOTE, campaign_id: CAMPAIGN, generatorType: "agent_table_record", edited: false, ...over } as RecapNote | null,
    sitting: { id: "s1", summary: null as string | null, summary_through_seq: 0, party_member_id: "m1" } as Awaited<ReturnType<RecapDeps["loadSitting"]>>,
    aiEnabled: true as boolean | null,
    story: "Wren opened the workshop door. The hinge pins had been drawn." as string | null,
    modelThrows: false,
    canPay: true,
    prompts: [] as string[],
    written: [] as string[],
    charged: [] as number[],
    uncharged: 0,
    released: [] as string[][],
    deps: undefined as unknown as RecapDeps,
  };
  const callModel: CallModel = async (request) => {
    if (h.modelThrows) throw new Error("model down");
    h.prompts.push(request.messages.map((m) => m.blocks.map((b) => (b.type === "text" ? b.text : "")).join("")).join("\n"));
    return { blocks: h.story === null ? [] : [{ type: "text", text: h.story }], stop: "end", usage };
  };
  h.deps = {
    loadNote: async () => h.note,
    loadCampaign: async () => ({ id: CAMPAIGN, user_id: DM, ai_enabled: h.aiEnabled }),
    isDm: async (_c, userId) => userId === DM,
    loadSitting: async () => h.sitting,
    loadTurns: async () => turns,
    loadFacts: async () => [{ body: "The brass key is gone.", known_to_player: true }, { body: "THE-HIDDEN-FACT: the mayor took it.", known_to_player: false }],
    characterName: async () => "Wren",
    resolveProvider: async () => ({ provider: "openai", model: "m1", isByok: false, callModel }),
    // 1 USD a million tokens in, 4 out: 2000 in and 400 out is 0.0036 USD; doubled over 0.0066 USD a credit is 1.09.
    loadPrice: async () => ({ inputPerMillion: 1, outputPerMillion: 4, cachedInputPerMillion: null }),
    loadCalibration: async () => ({ usdPerCredit: 0.0066, margin: 2 }),
    reserve: async () => (h.canPay ? { ok: true, ids: ["r1"] } : { ok: false, status: 402, error: "insufficient_credits" }),
    release: async (ids) => {
      h.released.push(ids);
    },
    writeNote: async (_id, content) => {
      h.written.push(content);
    },
    charge: async (_u, _byok, credits) => {
      h.charged.push(credits);
    },
    logUncharged: async () => {
      h.uncharged += 1;
    },
  };
  return h;
}

const tell = (h: ReturnType<typeof harness>, userId: string = DM) => tellSitting({ userId, body: { noteId: NOTE }, deps: h.deps });

describe("telling a sitting as a story", () => {
  // The notes are read by the players and may be read aloud to them. Bug caught: a hidden fact, a secret roll's
  // result or the player's out-of-character question handed to the model, and so told in the notes.
  it("writes from what the player saw and the facts the party knows, and nothing else", async () => {
    const h = harness();
    expect(await tell(h)).toEqual({ ok: true, credits: 2 });
    expect(h.prompts[0]).toContain("Wren: I open the workshop door.");
    expect(h.prompts[0]).toContain("The hinge pins had been drawn");
    expect(h.prompts[0]).toContain("The brass key is gone.");
    expect(h.prompts[0]).not.toContain("THE-HIDDEN-FACT");
    expect(h.prompts[0]).not.toContain("THE-SECRET-ROLL");
    expect(h.prompts[0]).not.toContain("Is the thief the mayor?");
  });

  // Bug caught: the telling returned but never put in the note, or the facts the note held thrown away with it.
  it("puts the telling in the note above the facts, and charges once, whole credits rounded up", async () => {
    const h = harness();
    await tell(h);
    expect(h.written).toHaveLength(1);
    const doc = h.written[0];
    expect(doc.indexOf("Wren opened the workshop door.")).toBeGreaterThan(-1);
    expect(doc.indexOf("The brass key is gone.")).toBeGreaterThan(doc.indexOf("Wren opened the workshop door."));
    expect(doc).not.toContain("THE-HIDDEN-FACT");
    expect(h.charged).toEqual([2]);
    expect(h.released).toEqual([["r1"]]);
  });

  // The maintainer: "we charge every successful AI call". Bug caught: a call that produced nothing charged, or a
  // failed one never giving its reservation back.
  it("charges nothing when the model writes nothing or fails, and gives the reservation back", async () => {
    const empty = harness();
    empty.story = null;
    expect(await tell(empty)).toEqual({ ok: false, status: 502, error: RECAP_MESSAGES.noStory });
    expect(empty.charged).toEqual([]);
    expect(empty.uncharged).toBe(1);
    expect(empty.written).toEqual([]);
    const down = harness();
    down.modelThrows = true;
    await expect(tell(down)).rejects.toThrow("model down");
    expect(down.charged).toEqual([]);
    expect(down.released).toEqual([["r1"]]);
  });

  // Bug caught: the Dungeon Master's own rewrite of the note replaced by a machine's telling; a note that no
  // sitting left "told" from nothing; anyone but the DM spending on it, or learning the note exists.
  it("refuses a note rewritten by hand, a note no sitting left, and anyone who is not the Dungeon Master", async () => {
    expect(await tell(harness({ edited: true }))).toEqual({ ok: false, status: 409, error: RECAP_MESSAGES.edited });
    expect(await tell(harness({ generatorType: "chronicle-recap" }))).toEqual({ ok: false, status: 422, error: RECAP_MESSAGES.notATableNote });
    const orphan = harness();
    orphan.sitting = null;
    expect(await tell(orphan)).toEqual({ ok: false, status: 422, error: RECAP_MESSAGES.notATableNote });
    const stranger = harness();
    expect(await tell(stranger, "player")).toEqual({ ok: false, status: 404, error: RECAP_MESSAGES.notFound });
    expect([...stranger.prompts, ...orphan.prompts]).toEqual([]);
  });

  it("makes no call when the account cannot pay or the campaign has AI off", async () => {
    const broke = harness();
    broke.canPay = false;
    expect(await tell(broke)).toEqual({ ok: false, status: 402, error: "insufficient_credits" });
    const off = harness();
    off.aiEnabled = false;
    expect(await tell(off)).toEqual({ ok: false, status: 403, error: RECAP_MESSAGES.aiOff });
    expect([...broke.prompts, ...off.prompts]).toEqual([]);
  });
});
