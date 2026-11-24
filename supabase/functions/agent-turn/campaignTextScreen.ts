// The campaign's own text is screened before the narrator reads it (#1021 row 18). A player can write some of what a
// turn carries (a character's notes, a place, a handout), so it is a way in for content the table refuses. Each
// section is checked with the same free moderation call as the rest of the table, its verdict is kept by hash so
// text that has not changed is never checked twice, and a refused section is swapped for one line.
//
// Fails open everywhere, like every screen here: a lookup, a moderation call or a write that fails lets the text
// through (logged), because an outage of the screen must not cost the player the turn.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHILD_TURN_THRESHOLDS } from "../_shared/agent/conduct.ts";
import { CHAT_TEXT_THRESHOLDS, screenChatText, thresholdsFor } from "../_shared/moderation.ts";

/** Bumped when the screen's rules change in a way an old verdict should not outlive. It is part of every key. */
export const SCREEN_VERSION = "ct1";

/** What stands where a section was withheld: the narrator can neither read nor repeat what it replaced. */
export const WITHHELD_LINE = "(Part of the campaign's own text was left out here: it did not pass the table's screen.)";

export interface Verdict {
  flagged: boolean;
  categories: string[];
}

/** What the screen needs from the outside: the cache, the classifier and the cache's write. */
export interface TextScreenIo {
  /** The cached verdicts for these hashes, in this campaign only; flagged by hash. */
  lookup(campaignId: string, hashes: string[]): Promise<Map<string, boolean>>;
  /** A verdict for one text, or null when it could not be judged (no key, a failed call). Logs the screening. */
  moderate(text: string, child: boolean): Promise<Verdict | null>;
  remember(campaignId: string, rows: Array<{ hash: string; verdict: Verdict }>): Promise<void>;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The cache key of a text: the screen's version, the thresholds it was held to and the text itself. The thresholds
 * are in it so that a child at the table, which tightens them, never reuses a verdict given at the looser ones.
 */
export function textKey(text: string, thresholds: Readonly<Record<string, number>>): Promise<string> {
  const sorted = Object.entries(thresholds).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Hex(`${SCREEN_VERSION}\n${JSON.stringify(sorted)}\n${text}`);
}

export interface ScreenedText {
  /** The collector's texts that were refused, to be swapped for `WITHHELD_LINE`. */
  withheld: ReadonlySet<string>;
}

/** Screens each distinct text once. Never throws. */
export async function screenCampaignTexts(input: { campaignId: string; child: boolean; texts: readonly string[]; io: TextScreenIo }): Promise<ScreenedText> {
  const { campaignId, child, io } = input;
  const withheld = new Set<string>();
  const distinct = [...new Set(input.texts)];
  if (distinct.length === 0) return { withheld };
  const thresholds = thresholdsFor(child ? CHILD_TURN_THRESHOLDS : undefined, CHAT_TEXT_THRESHOLDS);
  const keyed = await Promise.all(distinct.map(async (text) => ({ text, hash: await textKey(text, thresholds) })));

  let known = new Map<string, boolean>();
  try {
    known = await io.lookup(campaignId, keyed.map((k) => k.hash));
  } catch (error) {
    // Unreadable cache: every section is screened afresh, which costs calls, not the turn.
    console.error("agent-turn: reading the campaign text screenings failed:", error);
  }
  const misses: typeof keyed = [];
  for (const k of keyed) {
    const flagged = known.get(k.hash);
    if (flagged === undefined) misses.push(k);
    else if (flagged) withheld.add(k.text);
  }

  const judged = await Promise.all(
    misses.map(async (k) => {
      try {
        return { ...k, verdict: await io.moderate(k.text, child) };
      } catch (error) {
        console.error("agent-turn: screening a section of campaign text failed:", error);
        return { ...k, verdict: null };
      }
    }),
  );
  const toKeep: Array<{ hash: string; verdict: Verdict }> = [];
  for (const j of judged) {
    if (j.verdict === null) continue;
    if (j.verdict.flagged) withheld.add(j.text);
    toKeep.push({ hash: j.hash, verdict: j.verdict });
  }
  if (toKeep.length > 0) {
    try {
      await io.remember(campaignId, toKeep);
    } catch (error) {
      console.error("agent-turn: keeping the campaign text screenings failed:", error);
    }
  }
  return { withheld };
}

/**
 * Runs `assemble` twice: once to collect the campaign's sections (the filter keeps them as they are), then, after
 * screening, with a filter that swaps the refused ones. Assembling is pure and cheap; the point is that the screen
 * sees exactly the text that would have been sent. Answers what was assembled and whether anything was withheld.
 */
export async function assembleScreened<T>(input: {
  campaignId: string;
  child: boolean;
  io: TextScreenIo;
  assemble: (through: (text: string) => string) => T;
}): Promise<{ result: T; anyWithheld: boolean }> {
  const seen: string[] = [];
  input.assemble((text) => {
    seen.push(text);
    return text;
  });
  const { withheld } = await screenCampaignTexts({ campaignId: input.campaignId, child: input.child, texts: seen, io: input.io });
  if (withheld.size === 0) return { result: input.assemble((text) => text), anyWithheld: false };
  return { result: input.assemble((text) => (withheld.has(text) ? WITHHELD_LINE : text)), anyWithheld: true };
}

/** The real io: the service client reads and writes the cache, the moderation call logs as `campaign_text`. */
export function makeTextScreenIo(admin: SupabaseClient, ctx: { apiKey: () => string | null; userId: string }): TextScreenIo {
  return {
    async lookup(campaignId, hashes) {
      const { data, error } = await admin.from("campaign_text_screenings").select("text_hash, flagged").eq("campaign_id", campaignId).in("text_hash", hashes);
      if (error) throw error;
      const out = new Map<string, boolean>();
      for (const row of data ?? []) out.set(row.text_hash as string, row.flagged === true);
      return out;
    },
    async moderate(text, child) {
      const apiKey = ctx.apiKey();
      if (apiKey === null) return null;
      // Null means the call could not be made or judged (fail open): nothing to remember, nothing to withhold.
      return await screenChatText(text, {
        apiKey,
        admin,
        userId: ctx.userId,
        surface: "campaign_text",
        tighter: child ? CHILD_TURN_THRESHOLDS : undefined,
      });
    },
    async remember(campaignId, rows) {
      const { error } = await admin.from("campaign_text_screenings").upsert(
        rows.map((r) => ({ campaign_id: campaignId, text_hash: r.hash, flagged: r.verdict.flagged, categories: r.verdict.categories })),
        { onConflict: "campaign_id,text_hash" },
      );
      if (error) throw error;
    },
  };
}
