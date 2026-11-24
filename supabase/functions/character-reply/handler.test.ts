import { describe, expect, it } from "vitest";
import type { AgentUsage, CallModel } from "../_shared/agent/types";
import type { StandIn } from "../_shared/agent/standIn";
import { jsonError } from "../_shared/pipeline/respond";
import type { JudgeResult } from "../_shared/typesafe";
import { answerChatLine, type ChatLine, type ReplyDeps, type ReplyHold } from "./handler";

const LINE = "00000000-0000-4000-8000-0000000000a1";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const DM = "dm";
const SAM = "user-sam";
const usage: AgentUsage = { provider: "openai", model: "m1", inputTokens: 2000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 };
const ABOUT = "A wary ferryman's daughter who counts every coin twice and trusts the river more than people, loyal once won.";

const member = (id: string, over: Partial<StandIn> = {}): StandIn => ({
  id, name: id, pronouns: null, species: null, className: null, subclass: null, level: null, hitPoints: null,
  about: ABOUT, aiSpeaks: true, standsIn: true, playerUserId: `user-${id}`, ...over,
});

function harness(over: Partial<ChatLine> = {}) {
  const h = {
    line: {
      id: LINE, campaign_id: CAMPAIGN, user_id: SAM, recipient_user_id: null, type: "chat", sender_name: "Sam",
      message: "@wren are you with us?", mentions: [{ kind: "member", party_member_id: "wren", name: "wren" }], ...over,
    } as ChatLine | null,
    party: [member("wren"), member("folio")],
    loadRefusal: null as Response | null,
    aiOn: true,
    answered: [] as string[],
    ownerRefused: false,
    flagged: false,
    refuseHold: null as Response | null,
    modelText: '{"says": "Aye, I am here.", "remembers": "Sam asked if I was with them."}',
    prompts: [] as { system: string; user: string }[],
    posted: [] as { character: string; text: string; recipientUserId: string | null; unprompted: boolean }[],
    known: { partyNames: ["Sam", "Folio"], questTitles: ["The Drowned Ledger"] } as { partyNames: string[]; questTitles: string[] },
    spokenThisHour: 0,
    cause: 0.95 as number | null,
    key: true,
    judged: [] as unknown[],
    now: Date.parse("2026-11-24T12:00:00Z"),
    sinceAsked: [] as string[],
    memories: [] as { partyMemberId: string; ownerId: string; body: string }[],
    reservedOn: [] as string[],
    charged: [] as { ownerId: string; credits: number }[],
    recentAsked: 0,
    deps: undefined as unknown as ReplyDeps,
  };
  const callModel: CallModel = async (request) => {
    h.prompts.push({ system: request.system, user: request.messages.map((m) => m.blocks.map((b) => (b.type === "text" ? b.text : "")).join("")).join("\n") });
    return { blocks: [{ type: "text", text: h.modelText }], stop: "end", usage };
  };
  h.deps = {
    loadLine: async () => h.line,
    // Member-only and AI-on are `loadAiCampaign`'s rules (its own test); here only that its refusal is passed through.
    loadCampaign: async () => (h.loadRefusal ? { ok: false, response: h.loadRefusal } : { ok: true, campaign: { id: CAMPAIGN, user_id: DM, ai_enabled: true, text_provider: null } }),
    aiOn: async () => h.aiOn,
    loadParty: async () => h.party,
    answeredBy: async () => h.answered,
    ownerRefused: async () => h.ownerRefused,
    isFlagged: async () => h.flagged,
    resolveProvider: async () => ({ provider: "openai", model: "m1", isByok: false, callModel }),
    // 1 USD a million tokens in, 4 out: 2000 in and 400 out is 0.0036 USD; doubled over 0.0066 USD a credit is 1.09, so 2.
    loadPrice: async () => ({ inputPerMillion: 1, outputPerMillion: 4, cachedInputPerMillion: null }),
    loadCalibration: async () => ({ usdPerCredit: 0.0066, margin: 2 }),
    loadMemories: async () => ["Wren owes the ferryman."],
    loadRecent: async () => {
      h.recentAsked += 1;
      return [{ from: "Sam", text: "we leave at dawn" }];
    },
    // The release-once and charge-after-release rules are `withCreditHold`'s (its own test); this records whose
    // account is held and what is charged, and answers a refused hold the way the real one does.
    withHold: async (ownerId, _credits, work) => {
      h.reservedOn.push(ownerId);
      if (h.refuseHold) return h.refuseHold;
      const hold: ReplyHold = {
        charge: (_reason, line) => void h.charged.push({ ownerId, credits: line.cost }),
        free: () => {},
      };
      return work(hold);
    },
    postReply: async ({ character, text, recipientUserId, unprompted }) => {
      h.posted.push({ character: character.id, text, recipientUserId, unprompted });
    },
    loadKnown: async () => h.known,
    countUnprompted: async (_c, _m, since) => {
      h.sinceAsked.push(since);
      return h.spokenThisHour;
    },
    judge: async (request) => {
      if (!h.key) return null;
      h.judged.push(request.state);
      const result: JudgeResult = { model: "jev", inputTokens: 10, answers: h.cause === null ? {} : { cause: { type: "noul", noul: h.cause } } };
      return result;
    },
    now: () => h.now,
    fileMemory: async ({ partyMemberId, ownerId, body }) => {
      h.memories.push({ partyMemberId, ownerId, body });
    },
  };
  return h;
}

const ask = async (h: ReturnType<typeof harness>, userId = SAM) => {
  const response = await answerChatLine({ userId, body: { messageId: LINE }, deps: h.deps });
  return { status: response.status, ...((await response.json()) as object) };
};

// The maintainer's rules, 19 Nov 2026 (#1021 row 26).
describe("answerChatLine", () => {
  it("the addressed character answers in the open, remembers, and the Dungeon Master pays", async () => {
    const h = harness();
    expect(await ask(h)).toEqual({ status: 200, replies: 1 });
    expect(h.posted).toEqual([{ character: "wren", text: "Aye, I am here.", recipientUserId: null, unprompted: false }]);
    expect(h.memories).toEqual([{ partyMemberId: "wren", ownerId: DM, body: "Sam asked if I was with them." }]);
    // "players always play for free": reserved on and charged to the campaign's owner, never the one who typed.
    expect(h.reservedOn).toEqual([DM]);
    expect(h.charged).toEqual([{ ownerId: DM, credits: 2 }]);
  });

  it("only the one who typed a line may ask for its answer", async () => {
    const h = harness();
    expect(await ask(h, "user-mallory")).toMatchObject({ status: 404 });
    expect(h.posted).toEqual([]);
    expect(h.reservedOn).toEqual([]);
  });

  it("asking twice answers once", async () => {
    const h = harness();
    h.answered = ["wren"];
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.prompts).toEqual([]);
  });

  it("a line the screen refuses is answered by nobody, and no model is called", async () => {
    const h = harness();
    h.flagged = true;
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.prompts).toEqual([]);
    expect(h.reservedOn).toEqual([]);
  });

  it("nobody is played when the Dungeon Master's account may not generate", async () => {
    const held = harness();
    held.ownerRefused = true;
    expect(await ask(held)).toEqual({ status: 200, replies: 0 });
    expect(held.prompts).toEqual([]);
  });

  it("passes on the refusal when the campaign will not have the caller, and calls no model", async () => {
    const h = harness();
    h.loadRefusal = jsonError(403, "forbidden", "Only someone at this campaign can ask its characters to answer.");
    expect(await ask(h)).toMatchObject({ status: 403, error: "forbidden" });
    expect(h.prompts).toEqual([]);
    expect(h.reservedOn).toEqual([]);
  });

  it("#1234 answers 'nobody' quietly when AI is off, as before the pipeline: the chat asks on every line", async () => {
    const h = harness();
    h.aiOn = false;
    expect(await ask(h)).toMatchObject({ status: 200, replies: 0 });
    expect(h.prompts).toEqual([]);
    expect(h.reservedOn).toEqual([]);
  });

  it("a whisper is answered in a whisper to its sender, and the open chat is not shown to that call", async () => {
    const h = harness({ recipient_user_id: "user-folio", mentions: [] });
    expect(await ask(h)).toEqual({ status: 200, replies: 1 });
    expect(h.posted).toEqual([{ character: "folio", text: "Aye, I am here.", recipientUserId: SAM, unprompted: false }]);
    expect(h.recentAsked).toBe(0);
    expect(h.prompts[0].user).toContain("whispers to you");
  });

  it("a Dungeon Master out of credits is not charged, nobody speaks, and the refusal is the answer", async () => {
    const h = harness({ mentions: [{ kind: "party", party_member_id: null, name: "party" }] });
    h.refuseHold = jsonError(402, "insufficient_credits");
    expect(await ask(h)).toMatchObject({ status: 402, error: "insufficient_credits" });
    expect(h.posted).toEqual([]);
    expect(h.charged).toEqual([]);
    expect(h.reservedOn).toEqual([DM]); // one try, then the rest stay silent too
  });

  it("a reply the model did not write is not posted or charged", async () => {
    const h = harness();
    h.modelText = "I would rather not.";
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.posted).toEqual([]);
    expect(h.charged).toEqual([{ ownerId: DM, credits: 0 }]);
  });
});

// The maintainer, 24 Nov 2026: "when it has cause" (#1021 row 26).
describe("answerChatLine, speaking unprompted", () => {
  const open = (message: string, over: Partial<ChatLine> = {}) => harness({ message, mentions: [], ...over });

  it("a line naming something the character knows, judged a real reason, is answered unasked, marked, and billed to the DM", async () => {
    const h = open("did anyone ever find out what happened with The Drowned Ledger?");
    expect(await ask(h)).toEqual({ status: 200, replies: 2 });
    expect(h.posted.map((p) => [p.character, p.unprompted, p.recipientUserId])).toEqual([["wren", true, null], ["folio", true, null]]);
    expect(h.reservedOn).toEqual([DM, DM]);
    expect(h.charged).toEqual([{ ownerId: DM, credits: 2 }, { ownerId: DM, credits: 2 }]);
    expect(h.prompts[0].user).toContain("not to you");
  });

  it("no name it knows, no judge call and no model call", async () => {
    const h = open("shall we go and get breakfast");
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
    expect(h.prompts).toEqual([]);
  });

  it("a name only as part of a longer word does not count", async () => {
    const h = open("the ledgerdemain of it all, and wrenches too");
    h.known = { partyNames: ["Wren", "Ledger"], questTitles: [] };
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("a verdict below the threshold says nothing and costs the DM nothing", async () => {
    const h = open("Sam looked tired today");
    h.cause = 0.79;
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged.length).toBeGreaterThan(0);
    expect(h.prompts).toEqual([]);
    expect(h.reservedOn).toEqual([]);
  });

  it("a judge that gave no answer, or no platform key, says nothing", async () => {
    const none = open("Sam looked tired today");
    none.cause = null;
    expect(await ask(none)).toEqual({ status: 200, replies: 0 });
    const nokey = open("Sam looked tired today");
    nokey.key = false;
    expect(await ask(nokey)).toEqual({ status: 200, replies: 0 });
    expect(none.prompts.concat(nokey.prompts)).toEqual([]);
  });

  it("never the sender's own character", async () => {
    const h = open("Folio, the Drowned Ledger", { user_id: "user-wren" });
    h.known = { partyNames: ["Sam"], questTitles: ["Drowned Ledger"] };
    h.party = [member("wren")];
    expect(await ask(h, "user-wren")).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("a character that is addressed is answered by the old path only, never also unprompted", async () => {
    const h = open("@wren what do you make of Sam?", { mentions: [{ kind: "member", party_member_id: "wren", name: "wren" }] });
    h.party = [member("wren")];
    expect(await ask(h)).toEqual({ status: 200, replies: 1 });
    expect(h.posted.map((p) => p.unprompted)).toEqual([false]);
    expect(h.judged).toEqual([]);
  });

  it("without both words no character speaks up: the player's and the Dungeon Master's", async () => {
    const h = open("Sam looked tired today");
    h.party = [member("wren", { aiSpeaks: false }), member("folio", { standsIn: false })];
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("a whisper is never overheard", async () => {
    const h = open("Sam looked tired today", { recipient_user_id: "user-wren" });
    h.party = [member("folio")];
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("at most three an hour per character, counted over the last hour, and the full one is not even judged", async () => {
    const h = open("Sam looked tired today");
    h.party = [member("wren")];
    h.spokenThisHour = 3;
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
    expect(h.sinceAsked).toEqual(["2026-11-24T11:00:00.000Z"]);
    h.spokenThisHour = 2;
    expect(await ask(h)).toEqual({ status: 200, replies: 1 });
  });

  it("asking twice speaks up once: a character that already has a line for this message is left alone", async () => {
    const h = open("Sam looked tired today");
    h.answered = ["wren", "folio"];
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("a line the screen refuses draws nothing unasked either", async () => {
    const h = open("Sam looked tired today");
    h.flagged = true;
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.judged).toEqual([]);
  });

  it("a Dungeon Master out of credits is not an error to the one who typed: nobody speaks up", async () => {
    const h = open("Sam looked tired today");
    h.party = [member("wren")];
    h.refuseHold = jsonError(402, "insufficient_credits");
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
  });

  it("when the model has nothing to add, nothing is posted or charged", async () => {
    const h = open("Sam looked tired today");
    h.party = [member("wren")];
    h.modelText = '{"says": "", "remembers": null}';
    expect(await ask(h)).toEqual({ status: 200, replies: 0 });
    expect(h.posted).toEqual([]);
    expect(h.charged).toEqual([{ ownerId: DM, credits: 0 }]);
  });
});
