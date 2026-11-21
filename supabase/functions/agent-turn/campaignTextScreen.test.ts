import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { CHILD_TURN_THRESHOLDS } from "../_shared/agent/conduct.ts";
import { IMAGE_PROMPT_THRESHOLDS, thresholdsFor } from "../_shared/moderation.ts";
import { assembleScreened, makeTextScreenIo, screenCampaignTexts, textKey, WITHHELD_LINE, type TextScreenIo, type Verdict } from "./campaignTextScreen.ts";
import { stateFor, systemFor } from "./turnSupport.ts";
import type { CampaignRow } from "./turnTypes.ts";

const C = "c1";

/** An io that records what it was asked, with a cache and a verdict per text. */
function io(over: { cache?: Map<string, boolean>; verdict?: (text: string) => Verdict | null } = {}) {
  const calls = { lookups: [] as Array<{ campaignId: string; hashes: string[] }>, moderated: [] as Array<{ text: string; child: boolean }>, remembered: [] as Array<{ hash: string; verdict: Verdict }> };
  const real: TextScreenIo = {
    lookup: async (campaignId, hashes) => {
      calls.lookups.push({ campaignId, hashes });
      return new Map([...(over.cache ?? new Map())].filter(([h]) => hashes.includes(h)));
    },
    moderate: async (text, child) => {
      calls.moderated.push({ text, child });
      return over.verdict ? over.verdict(text) : { flagged: false, categories: [] };
    },
    remember: async (_campaign, rows) => {
      calls.remembered.push(...rows);
    },
  };
  return { io: real, calls };
}

const loose = thresholdsFor(undefined);
const tight = thresholdsFor(CHILD_TURN_THRESHOLDS);

describe("screenCampaignTexts", () => {
  // Bug caught: a cached clean text screened again, so every turn paid the moderation latency for unchanged text.
  it("makes no moderation call for a text whose clean verdict is cached", async () => {
    const hash = await textKey("A quiet inn.", loose);
    const { io: i, calls } = io({ cache: new Map([[hash, false]]) });
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["A quiet inn."], io: i });
    expect(calls.moderated).toEqual([]);
    expect(calls.remembered).toEqual([]);
    expect(out.withheld.size).toBe(0);
  });

  // Bug caught: a cached refusal forgotten, so refused text came back after one turn.
  it("withholds a text whose flagged verdict is cached, without a call", async () => {
    const hash = await textKey("Bad text.", loose);
    const { io: i, calls } = io({ cache: new Map([[hash, true]]) });
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["Bad text."], io: i });
    expect(calls.moderated).toEqual([]);
    expect([...out.withheld]).toEqual(["Bad text."]);
  });

  // Bug caught: a miss judged but never kept, so the same text is judged on every turn.
  it("screens a miss and writes its verdict back under its hash", async () => {
    const { io: i, calls } = io({ verdict: () => ({ flagged: true, categories: ["sexual"] }) });
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["New text."], io: i });
    expect(calls.moderated).toEqual([{ text: "New text.", child: false }]);
    expect(calls.remembered).toEqual([{ hash: await textKey("New text.", loose), verdict: { flagged: true, categories: ["sexual"] } }]);
    expect(out.withheld.has("New text.")).toBe(true);
  });

  // Bug caught: all misses looked up one by one, or a section present twice screened twice.
  it("reads the cache once for the whole turn and screens a repeated text once", async () => {
    const { io: i, calls } = io();
    await screenCampaignTexts({ campaignId: C, child: false, texts: ["a", "b", "a"], io: i });
    expect(calls.lookups).toHaveLength(1);
    expect(calls.lookups[0].hashes).toHaveLength(2);
    expect(calls.moderated.map((m) => m.text).sort()).toEqual(["a", "b"]);
  });

  // Bug caught: a clean verdict given at the loose thresholds reused for a table with a child, who is held to a tighter bar.
  it("does not reuse a verdict across the child thresholds", async () => {
    expect(await textKey("same", loose)).not.toBe(await textKey("same", tight));
    const hash = await textKey("same", loose);
    const { io: i, calls } = io({ cache: new Map([[hash, false]]) });
    await screenCampaignTexts({ campaignId: C, child: true, texts: ["same"], io: i });
    expect(calls.moderated).toEqual([{ text: "same", child: true }]);
  });

  // Bug caught: the screen version or the text left out of the key, so an edited text keeps its old verdict.
  it("keys on the text itself", async () => {
    expect(await textKey("one", loose)).not.toBe(await textKey("two", loose));
    expect(await textKey("one", loose)).toMatch(/^[0-9a-f]{64}$/);
  });

  // Bug caught: a failed cache read costing the turn, or leaving text out because it could not be checked.
  it("screens afresh and lets text through when the lookup fails", async () => {
    const { io: i, calls } = io();
    i.lookup = async () => {
      throw new Error("down");
    };
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["x"], io: i });
    expect(calls.moderated).toHaveLength(1);
    expect(out.withheld.size).toBe(0);
  });

  // Bug caught: a moderation outage withholding text (failing closed), or one failing text sinking the others' verdicts.
  it("lets text through when moderation fails or cannot judge, and still judges the rest", async () => {
    const { io: i, calls } = io();
    i.moderate = async (text) => {
      if (text === "boom") throw new Error("down");
      if (text === "nokey") return null;
      return { flagged: text === "bad", categories: [] };
    };
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["boom", "nokey", "bad"], io: i });
    expect([...out.withheld]).toEqual(["bad"]);
    // Only the judged text is remembered: an unjudged one must not be cached as clean.
    expect(calls.remembered.map((r) => r.hash)).toEqual([await textKey("bad", loose)]);
  });

  // Bug caught: a failed write-back costing the turn or undoing the refusal it carried.
  it("still withholds when the write-back fails", async () => {
    const { io: i } = io({ verdict: () => ({ flagged: true, categories: [] }) });
    i.remember = async () => {
      throw new Error("write down");
    };
    const out = await screenCampaignTexts({ campaignId: C, child: false, texts: ["bad"], io: i });
    expect(out.withheld.has("bad")).toBe(true);
  });
});

describe("makeTextScreenIo", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Bug caught: the lookup without the campaign filter, so one campaign's verdict decides another's text.
  it("reads verdicts of this campaign only", async () => {
    const fake = createSupabaseFake();
    fake.seed("campaign_text_screenings", [
      { campaign_id: C, text_hash: "h1", flagged: true },
      { campaign_id: "other", text_hash: "h1", flagged: false },
      { campaign_id: "other", text_hash: "h2", flagged: true },
    ]);
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    expect([...(await real.lookup(C, ["h1", "h2"]))]).toEqual([["h1", true]]);
  });

  // Bug caught: a lookup error read as "no verdicts", which hides an outage as a cache miss with no trace.
  it("throws a failed lookup so the caller can log it", async () => {
    const fake = createSupabaseFake();
    fake.failNext("campaign_text_screenings", { message: "down" });
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    await expect(real.lookup(C, ["h"])).rejects.toThrow();
  });

  // Bug caught: a screened miss not logged like the other screens, so the thresholds cannot be tuned for this text.
  it("logs a screened miss to prompt_screenings as campaign_text and answers its verdict", async () => {
    const fake = createSupabaseFake();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ results: [{ category_scores: { sexual: 0.95 } }] }), { status: 200 }));
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    expect(await real.moderate("lewd", false)).toEqual({ flagged: true, categories: ["sexual"] });
    const rows = fake.rows("prompt_screenings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ generation_type: "campaign_text", blocked: true, user_id: "u" });
  });

  // Bug caught: the child's tighter bar ignored, so 0.3 sexual passes at a table with a child.
  it("holds a child's table to the tighter thresholds", async () => {
    const fake = createSupabaseFake();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ results: [{ category_scores: { sexual: 0.3 } }] }), { status: 200 }));
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    expect((await real.moderate("t", false))?.flagged).toBe(false);
    expect((await real.moderate("t", true))?.flagged).toBe(true);
    expect(IMAGE_PROMPT_THRESHOLDS.sexual).toBeGreaterThan(0.3);
  });

  // Bug caught: no key or a failed moderation call answered as "clean", which would be cached and never rechecked.
  it("answers null, not clean, with no key or a failed call", async () => {
    const fake = createSupabaseFake();
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => null, userId: "u" });
    expect(await real.moderate("t", false)).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    const keyed = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    expect(await keyed.moderate("t", false)).toBeNull();
  });

  // Bug caught: the verdict written without its campaign, so the cache row is unreachable or shared.
  it("writes verdicts under the campaign and the hash", async () => {
    const fake = createSupabaseFake();
    const real = makeTextScreenIo(fake.client as unknown as SupabaseClient, { apiKey: () => "k", userId: "u" });
    await real.remember(C, [{ hash: "h", verdict: { flagged: true, categories: ["hate"] } }]);
    expect(fake.rows("campaign_text_screenings")).toMatchObject([{ campaign_id: C, text_hash: "h", flagged: true, categories: ["hate"] }]);
  });
});

describe("assembleScreened with the real assemblers", () => {
  const campaign = { id: C, user_id: "u", name: "Cup Town", game_system: "dnd5e", table_violence: "standard" } as unknown as CampaignRow;
  const base = { scene: null, quests: null, record: [], fights: null };

  // Bug caught: our own fixed rules text sent to the screen (a wasted call per turn, and a false refusal of the rules).
  it("never screens the table's own rules text or an empty state's fixed sentences", async () => {
    const { io: i, calls } = io();
    await assembleScreened({
      campaignId: C,
      child: false,
      io: i,
      assemble: (through) => ({ system: systemFor({ campaign, character: null, peoples: [], through }), state: stateFor({ ...base, through }) }),
    });
    expect(calls.moderated).toEqual([]);
  });

  // Bug caught: a refused campaign section left in the instructions, or the refusal taking our rules down with it.
  it("swaps a refused section for the line and leaves the rules and other sections", async () => {
    const { io: i } = io({ verdict: (t) => ({ flagged: t.includes("BAD-WORLD"), categories: [] }) });
    const { result, anyWithheld } = await assembleScreened({
      campaignId: C,
      child: false,
      io: i,
      assemble: (through) => ({ system: systemFor({ campaign, character: null, peoples: ["Marrow"], world: "BAD-WORLD text", through }), state: "" }),
    });
    expect(anyWithheld).toBe(true);
    expect(result.system).not.toContain("BAD-WORLD");
    expect(result.system).toContain(WITHHELD_LINE);
    expect(result.system).toContain("Marrow");
    expect(result.system).toContain("Campaign: Cup Town");
  });

  // Bug caught: state sections from campaign rows (a memory, the record) skipping the screen.
  it("screens state sections built from campaign rows", async () => {
    const { io: i, calls } = io({ verdict: (t) => ({ flagged: t.includes("BAD-FACT"), categories: [] }) });
    const record = [{ id: "f1", body: "BAD-FACT here", hidden: false }] as never;
    const { result } = await assembleScreened({ campaignId: C, child: false, io: i, assemble: (through) => ({ state: stateFor({ ...base, record, through }) }) });
    expect(calls.moderated.some((m) => m.text.includes("BAD-FACT"))).toBe(true);
    expect(result.state).not.toContain("BAD-FACT");
    expect(result.state).toContain(WITHHELD_LINE);
  });

  // Bug caught: the all-cached turn still calling moderation, or reading the cache more than once.
  it("a turn whose sections are all cached makes one read and no moderation call", async () => {
    const first = io();
    const texts: string[] = [];
    await assembleScreened({ campaignId: C, child: false, io: first.io, assemble: (through) => ({ system: systemFor({ campaign, character: null, peoples: ["Marrow"], world: "W", through }) }) });
    for (const m of first.calls.moderated) texts.push(m.text);
    const cache = new Map<string, boolean>();
    for (const t of texts) cache.set(await textKey(t, loose), false);
    const second = io({ cache });
    await assembleScreened({ campaignId: C, child: false, io: second.io, assemble: (through) => ({ system: systemFor({ campaign, character: null, peoples: ["Marrow"], world: "W", through }) }) });
    expect(second.calls.lookups).toHaveLength(1);
    expect(second.calls.moderated).toEqual([]);
  });

  // Bug caught: the cache read not scoped to the turn's campaign.
  it("looks up under the turn's campaign", async () => {
    const { io: i, calls } = io();
    await assembleScreened({ campaignId: C, child: false, io: i, assemble: (through) => ({ system: systemFor({ campaign, character: null, peoples: ["Marrow"], through }) }) });
    expect(calls.lookups.every((l) => l.campaignId === C)).toBe(true);
  });
});
