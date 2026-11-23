// Ask's `read_rules` reads (#1253 follow-up): which books, which edition, which rows. Run as the CALLER (their own
// client), so the database still decides what they may read; the two filters that matter here are in the queries
// themselves and not in RLS: the campaign's edition (a 2024 table never hears a 2014 rule) and its enabled sources
// (the library is opt-in per source, never forced).

import type { SupabaseClient } from "@supabase/supabase-js";
import { SRD_CONDITIONS_2014 } from "../../../../src/data/srdConditions2014.ts";
import { SRD_CONDITIONS_2024 } from "../../../../src/data/srdConditions2024.ts";
import { CONDITION_PATCHES } from "../../../../src/data/conditionPatches.ts";
import type { Condition } from "../../../../src/types/condition.types.ts";
import { gameSystemEdition } from "../gameSystem.ts";
import {
  RULES_HITS_MAX, capText, rankCandidates, searchTerms,
  type RulesCandidate, type RulesHit, type RulesHitKind, type RulesKind, type RulesRead,
} from "./askRules.ts";

/** Each query asks for a handful more than are kept, so the ranking in code has something to choose between. */
const FETCH_LIMIT = 24;

type Edition = "2014" | "2024";

/** The edition's conditions: the baked SRD list with the per-edition patches over it, as the app's own resolver does, minus the tracking marker "Hidden" that is no condition. */
function conditionsOf(edition: Edition): Condition[] {
  const byId = new Map<string, Condition>((edition === "2014" ? SRD_CONDITIONS_2014 : SRD_CONDITIONS_2024).map((c) => [c.id, c]));
  for (const [id, patch] of Object.entries(CONDITION_PATCHES[edition])) byId.set(id, patch);
  byId.delete("hidden");
  return [...byId.values()];
}

/** `name ilike %t% or text ilike %t%` for every term. The terms are letters and digits only (`searchTerms`). */
function anyTerm(columns: readonly string[], terms: readonly string[]): string {
  return columns.flatMap((c) => terms.map((t) => `${c}.ilike.%${t}%`)).join(",");
}

const LIBRARY_TABLES = { spell: "library_spells", monster: "library_monsters", item: "library_items" } as const;

export async function readRulesFrom(
  client: SupabaseClient,
  input: { campaignId: string; gameSystem: string | null; query: string; kind: RulesKind },
): Promise<RulesRead> {
  const edition = gameSystemEdition(input.gameSystem);
  if (edition === undefined) return { status: "no_system" };

  const enabled = await client.from("campaign_enabled_sources").select("source_slug").eq("campaign_id", input.campaignId);
  if (enabled.error) throw enabled.error;
  const sources = enabled.data.map((r) => r.source_slug as string);
  if (sources.length === 0) return { status: "ok", edition, hits: [], books: [] };

  const titled = await client.from("content_sources").select("key, title").in("key", sources);
  if (titled.error) throw titled.error;
  const titles = new Map<string, string>(titled.data.map((r) => [r.key as string, r.title as string]));
  const books = sources.map((s) => titles.get(s)).filter((t): t is string => typeof t === "string" && t !== "");

  const terms = searchTerms(input.query);
  const withTitle = (c: RulesCandidate): RulesHit => ({ ...c, sourceTitle: titles.get(c.source) ?? null });
  if (terms.length === 0) return { status: "ok", edition, hits: [], books };

  const rules = async (): Promise<RulesCandidate[]> => {
    const { data, error } = await client
      .from("library_rules")
      .select("name, content, doc_slug")
      .eq("ruleset", edition)
      .in("doc_slug", sources)
      .or(anyTerm(["name", "content"], terms))
      .limit(FETCH_LIMIT);
    if (error) throw error;
    return data.map((r) => ({ kind: "rule" as const, name: String(r.name), source: String(r.doc_slug), text: String(r.content) }));
  };

  // The conditions are the edition's SRD text, so they are the campaign's only when it has that SRD enabled.
  const conditions = (): RulesCandidate[] => {
    const source = `srd-${edition}`;
    if (!sources.includes(source)) return [];
    return conditionsOf(edition).map((c) => ({ kind: "condition" as const, name: c.name, source, text: c.description }));
  };

  const library = async (kind: Exclude<RulesHitKind, "rule" | "condition">): Promise<RulesCandidate[]> => {
    const { data, error } = await client
      .from(LIBRARY_TABLES[kind])
      .select("name, description, source")
      .eq("ruleset", edition)
      .in("source", sources)
      .or(anyTerm(["name"], terms))
      .limit(FETCH_LIMIT);
    if (error) throw error;
    return data.map((r) => ({ kind, name: String(r.name), source: String(r.source), text: typeof r.description === "string" ? r.description : "" }));
  };

  const ranked = async (...groups: Array<() => Promise<RulesCandidate[]> | RulesCandidate[]>): Promise<RulesCandidate[]> => {
    const found = await Promise.all(groups.map(async (g) => rankCandidates(await g(), terms)));
    return found.flat();
  };

  let candidates: RulesCandidate[];
  switch (input.kind) {
    case "rule": candidates = await ranked(rules); break;
    case "condition": candidates = await ranked(conditions); break;
    case "spell": candidates = await ranked(() => library("spell")); break;
    case "monster": candidates = await ranked(() => library("monster")); break;
    case "item": candidates = await ranked(() => library("item")); break;
    case "any": {
      // The game's own rules first, then what a book lists (spells, creatures, items).
      const first = await ranked(rules, conditions);
      const rest = await ranked(() => library("spell"), () => library("monster"), () => library("item"));
      candidates = [...first, ...rest];
      break;
    }
  }
  const hits = candidates.slice(0, RULES_HITS_MAX).map((c) => withTitle({ ...c, text: capText(c.text) }));
  return { status: "ok", edition, hits, books };
}
