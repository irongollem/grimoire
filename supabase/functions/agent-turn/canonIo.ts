// What the AI table reads of the campaign's canon, and what it writes back (#1226 story 9). The rules live in
// `_shared/agent/canon.ts` and `canonCheck.ts`; this file is the reading and the writing, as the caller.
//
// Canon tables are the DM's alone by RLS and the person at the AI table is the DM, so the reads go through the
// caller's own client like the record's; the nearest-entries function and the world block are service-role reads of
// the one campaign the handler has already checked. A loader throws on any read error: the caller (`safely`) decides
// what an unreadable section costs, never the turn.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { toVectorLiteral } from "../_shared/embeddings.ts";
import {
  capCanonHere,
  chronicleExcerpt,
  latestChronicle,
  type ChronicleRow,
  type SittingRow,
  LOOKUP_PARTS,
  plain,
  readableMatches,
  type BroughtOut,
  type CanonHere,
  type CanonLookupEntry,
  type CanonMatch,
} from "../_shared/agent/canon.ts";
import type { CanonCheckMaterial } from "../_shared/agent/canonCheck.ts";

/** Everything of the canon the turn reaches, as `handler.ts` is handed it. */
export interface CanonStore {
  /** The world block as text, "" when the campaign has nothing to say. */
  worldText(campaignId: string): Promise<string>;
  /** A short excerpt of the newest chronicle entry that is not the running sitting's own; "" when there is none. */
  previously(campaignId: string, runningSessionId: string | null): Promise<string>;
  /** What the canon holds where the party stands and about the people present. */
  here(campaignId: string, locationId: string | null, present: ReadonlyArray<{ id: string; name: string }>): Promise<CanonHere>;
  /** The nearest readable entries to a question; null when the canon cannot be searched by meaning right now. */
  lookup(campaignId: string, query: string): Promise<CanonLookupEntry[] | null>;
  /** What an invention is held against: for the judge, never for the Narrator. */
  material(campaignId: string): Promise<CanonCheckMaterial>;
  /** Ticks a clue found, or a passage told to the party. Throws when it could not be written. */
  bringOut(ctx: { campaignId: string; campaignSessionId: string | null }, brought: BroughtOut): Promise<void>;
}

const MATCH_COUNT = 12;
const LIST_READ_MAX = 24;
const TRUTHS_READ_MAX = 60;

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A truth is its title, the way the world block words it; a body stands in for an empty title. */
const entryText = (row: Row): string => {
  const title = str(row.title).trim();
  return title !== "" ? title : plain(str(row.body), 300);
};

export function canonStore(input: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  /** Embeds a query with the platform's provider and meters it; null when no provider can. */
  embedQuery: (query: string) => Promise<{ vector: number[]; model: string } | null>;
}): CanonStore {
  const { supabase, admin } = input;

  /** The names of the people (and, through them, of the factions' members present) these links name. */
  async function knownToNames(campaignId: string, entryIds: string[], present: ReadonlyArray<{ id: string; name: string }>): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (entryIds.length === 0) return out;
    const links = await supabase
      .from("world_links")
      .select("from_canon_entry_id, to_kind, to_npc_id, to_faction_id, to_party_member_id")
      .eq("campaign_id", campaignId)
      .eq("from_kind", "canon")
      .eq("type", "known_to")
      .in("from_canon_entry_id", entryIds);
    if (links.error) throw links.error;
    const rows = (links.data ?? []) as Row[];
    const npcIds = [...new Set(rows.map((r) => r.to_npc_id).filter((v): v is string => typeof v === "string"))];
    const factionIds = [...new Set(rows.map((r) => r.to_faction_id).filter((v): v is string => typeof v === "string"))];
    const partyIds = [...new Set(rows.map((r) => r.to_party_member_id).filter((v): v is string => typeof v === "string"))];
    const [npcs, factions, members, party] = await Promise.all([
      npcIds.length === 0 ? Promise.resolve({ data: [] as Row[], error: null }) : supabase.from("npcs").select("id, name").eq("campaign_id", campaignId).in("id", npcIds),
      factionIds.length === 0 ? Promise.resolve({ data: [] as Row[], error: null }) : supabase.from("factions").select("id, name").eq("campaign_id", campaignId).in("id", factionIds),
      factionIds.length === 0 ? Promise.resolve({ data: [] as Row[], error: null }) : supabase.from("faction_npcs").select("faction_id, npc_id").in("faction_id", factionIds),
      partyIds.length === 0 ? Promise.resolve({ data: [] as Row[], error: null }) : supabase.from("party_members").select("id, name").eq("campaign_id", campaignId).in("id", partyIds),
    ]);
    if (party.error) throw party.error;
    if (npcs.error) throw npcs.error;
    if (factions.error) throw factions.error;
    if (members.error) throw members.error;
    const npcName = new Map((npcs.data ?? []).map((r) => [str((r as Row).id), str((r as Row).name)]));
    const factionName = new Map((factions.data ?? []).map((r) => [str((r as Row).id), str((r as Row).name)]));
    const partyName = new Map((party.data ?? []).map((r) => [str((r as Row).id), str((r as Row).name)]));
    const presentName = new Map(present.map((p) => [p.id, p.name]));
    for (const row of rows) {
      const entry = str(row.from_canon_entry_id);
      const names = out.get(entry) ?? [];
      const npc = typeof row.to_npc_id === "string" ? row.to_npc_id : null;
      const faction = typeof row.to_faction_id === "string" ? row.to_faction_id : null;
      if (npc !== null) names.push(npcName.get(npc) ?? presentName.get(npc) ?? "");
      const member = typeof row.to_party_member_id === "string" ? row.to_party_member_id : null;
      if (member !== null) names.push(partyName.get(member) ?? "");
      if (faction !== null) {
        const members_ = ((members.data ?? []) as Row[]).filter((m) => m.faction_id === faction).map((m) => str(m.npc_id));
        // The faction's people who are here may say it; the faction's name says who else it belongs to.
        const here = members_.map((id) => presentName.get(id)).filter((n): n is string => n !== undefined);
        names.push(...(here.length > 0 ? here : [`members of ${factionName.get(faction) ?? "a faction"}`]));
      }
      out.set(entry, names.filter((n) => n !== ""));
    }
    return out;
  }

  /** The latest step each force has reached. */
  async function latestSteps(campaignId: string, forceIds: string[]): Promise<Map<string, string>> {
    const steps = new Map<string, string>();
    if (forceIds.length === 0) return steps;
    const { data, error } = await supabase
      .from("canon_force_steps")
      .select("force_id, title, reached_at")
      .eq("campaign_id", campaignId)
      .in("force_id", forceIds)
      .not("reached_at", "is", null)
      .order("reached_at", { ascending: false });
    if (error) throw error;
    for (const row of (data ?? []) as Row[]) {
      const force = str(row.force_id);
      if (!steps.has(force)) steps.set(force, str(row.title));
    }
    return steps;
  }

  return {
    async worldText(campaignId) {
      return worldBlockText(await loadWorldBlock(admin, campaignId)).trim();
    },

    async previously(campaignId, runningSessionId) {
      const [sessions, notes] = await Promise.all([
        supabase.from("campaign_sessions").select("id, number, started_at, played_on, created_at").eq("campaign_id", campaignId),
        supabase.from("notes").select("session_id, content, created_at").eq("campaign_id", campaignId).not("session_id", "is", null),
      ]);
      if (sessions.error) throw sessions.error;
      if (notes.error) throw notes.error;
      const over = ((sessions.data ?? []) as SittingRow[]).filter((s) => s.id !== runningSessionId);
      const chronicle = latestChronicle(over, (notes.data ?? []) as ChronicleRow[]);
      return chronicle === null ? "" : chronicleExcerpt(chronicle.content);
    },

    async here(campaignId, locationId, present) {
      const ids = present.map((p) => p.id);
      const ties: string[] = [];
      if (locationId !== null) ties.push(`location_id.eq.${locationId}`);
      if (ids.length > 0) ties.push(`npc_id.in.(${ids.join(",")})`);
      const tied = ties.join(",");

      const [clues, passages, questions] = await Promise.all([
        tied === ""
          ? Promise.resolve({ data: [] as Row[], error: null })
          : supabase.from("canon_clues").select("id, secret_id, title").eq("campaign_id", campaignId).is("found_at", null).or(tied).order("sort_order").limit(LIST_READ_MAX),
        tied === ""
          ? Promise.resolve({ data: [] as Row[], error: null })
          : supabase.from("canon_lore_passages").select("id, title, body").eq("campaign_id", campaignId).is("told_at", null).or(tied).order("sort_order").limit(LIST_READ_MAX),
        supabase.from("canon_entries").select("title").eq("campaign_id", campaignId).eq("part", "question").order("sort_order").limit(LIST_READ_MAX),
      ]);
      if (clues.error) throw clues.error;
      if (passages.error) throw passages.error;
      if (questions.error) throw questions.error;

      // Truths only some know, for the people who are here (and the faction they belong to). Only a truth with a
      // knower in the room is put in front of the Narrator; the rest is reached by lookup.
      const presentNames = new Set(present.map((p) => p.name));
      const knows: CanonHere["knows"] = [];
      if (present.length > 0) {
        const some = await supabase.from("canon_entries").select("id, title, body").eq("campaign_id", campaignId).eq("part", "truth").eq("knowledge", "some").limit(TRUTHS_READ_MAX);
        if (some.error) throw some.error;
        const rows = (some.data ?? []) as Row[];
        const names = await knownToNames(campaignId, rows.map((r) => str(r.id)), present);
        for (const row of rows) {
          const who = [...new Set((names.get(str(row.id)) ?? []).filter((n) => presentNames.has(n)))];
          if (who.length > 0) knows.push({ who, truth: entryText(row) });
        }
      }

      // Forces that moved here: a link from the force to this place.
      let forces: CanonHere["forces"] = [];
      if (locationId !== null) {
        const links = await supabase
          .from("world_links")
          .select("from_canon_entry_id")
          .eq("campaign_id", campaignId)
          .eq("from_kind", "canon")
          .eq("to_kind", "location")
          .eq("to_location_id", locationId)
          .in("type", ["took_place_at", "about"]);
        if (links.error) throw links.error;
        const entryIds = [...new Set(((links.data ?? []) as Row[]).map((r) => str(r.from_canon_entry_id)).filter((v) => v !== ""))];
        if (entryIds.length > 0) {
          const entries = await supabase.from("canon_entries").select("id, title").eq("campaign_id", campaignId).eq("part", "force").in("id", entryIds).order("sort_order");
          if (entries.error) throw entries.error;
          const rows = (entries.data ?? []) as Row[];
          const steps = await latestSteps(campaignId, rows.map((r) => str(r.id)));
          forces = rows.map((r) => ({ title: str(r.title), step: steps.get(str(r.id)) ?? null }));
        }
      }

      return capCanonHere({
        clues: ((clues.data ?? []) as Row[]).map((r) => ({ id: str(r.id), secretId: str(r.secret_id), line: str(r.title) })),
        passages: ((passages.data ?? []) as Row[]).map((r) => ({ id: str(r.id), title: str(r.title), text: str(r.body) })),
        knows,
        questions: ((questions.data ?? []) as Row[]).map((r) => str(r.title)).filter((t) => t !== ""),
        forces,
      });
    },

    async lookup(campaignId, query) {
      const embedded = await input.embedQuery(query);
      if (embedded === null) return null;
      const matched = await admin.rpc("match_campaign_canon", {
        query_embedding: toVectorLiteral(embedded.vector),
        p_campaign_id: campaignId,
        p_embedding_model: embedded.model,
        // Never `secret`: the Narrator reads a secret's clues where the party stands, never its statement.
        p_parts: [...LOOKUP_PARTS],
        match_count: MATCH_COUNT,
      });
      if (matched.error) throw matched.error;
      const hits = readableMatches(((matched.data ?? []) as Row[]).map((r): CanonMatch => ({
        id: str(r.id),
        part: str(r.part),
        knowledge: typeof r.knowledge === "string" ? r.knowledge : null,
        title: str(r.title),
        distance: Number(r.distance),
      })));
      if (hits.length === 0) return [];
      const ids = hits.map((h) => h.id);
      const loreIds = hits.filter((h) => h.part === "lore").map((h) => h.id);
      const forceIds = hits.filter((h) => h.part === "force").map((h) => h.id);
      const someIds = hits.filter((h) => h.part === "truth" && h.knowledge === "some").map((h) => h.id);
      const [bodies, passages, steps, knownTo] = await Promise.all([
        supabase.from("canon_entries").select("id, body, wants").eq("campaign_id", campaignId).in("id", ids),
        loreIds.length === 0
          ? Promise.resolve({ data: [] as Row[], error: null })
          : supabase.from("canon_lore_passages").select("entry_id, title, body").eq("campaign_id", campaignId).in("entry_id", loreIds).order("sort_order"),
        latestSteps(campaignId, forceIds),
        knownToNames(campaignId, someIds, []),
      ]);
      if (bodies.error) throw bodies.error;
      if (passages.error) throw passages.error;
      const body = new Map(((bodies.data ?? []) as Row[]).map((r) => [str(r.id), r]));
      const passagesOf = new Map<string, string[]>();
      for (const p of (passages.data ?? []) as Row[]) {
        const list = passagesOf.get(str(p.entry_id)) ?? [];
        list.push(`${str(p.title)}: ${plain(str(p.body), 400)}`);
        passagesOf.set(str(p.entry_id), list);
      }
      return hits.map((h): CanonLookupEntry => {
        const row = body.get(h.id);
        const wants = row === undefined ? "" : str(row.wants).trim();
        const text = [
          row === undefined ? "" : plain(str(row.body), 600),
          wants === "" ? "" : `It wants: ${wants}`,
          ...(passagesOf.get(h.id) ?? []),
        ].filter((t) => t !== "").join(" ");
        return {
          part: h.part,
          title: h.title,
          knowledge: h.knowledge,
          text,
          knownTo: knownTo.get(h.id) ?? [],
          step: steps.get(h.id) ?? null,
        };
      });
    },

    async material(campaignId) {
      const { data, error } = await supabase
        .from("canon_entries")
        .select("id, part, knowledge, title, body, sort_order")
        .eq("campaign_id", campaignId)
        .in("part", ["truth", "question", "secret"])
        .order("sort_order");
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const body = (r: Row): string => plain(str(r.body), 300);
      return {
        truths: rows.filter((r) => r.part === "truth").map((r) => ({ text: entryText(r), secret: r.knowledge === "secret" })).filter((t) => t.text !== ""),
        questions: rows.filter((r) => r.part === "question").map((r) => str(r.title).trim()).filter((t) => t !== ""),
        secrets: rows
          .filter((r) => r.part === "secret")
          .map((r) => ({ id: str(r.id), statement: [str(r.title).trim(), body(r)].filter((t) => t !== "").join(": ") }))
          .filter((s) => s.statement !== ""),
      };
    },

    async bringOut(ctx, brought) {
      const now = new Date().toISOString();
      if (brought.kind === "clue") {
        // Only a clue that is still waiting: a clue found at the table by the DM meanwhile is left as they marked it.
        const { error } = await supabase
          .from("canon_clues")
          .update({ found_at: now, found_session_id: ctx.campaignSessionId })
          .eq("id", brought.id)
          .eq("campaign_id", ctx.campaignId)
          .is("found_at", null);
        if (error) throw error;
        return;
      }
      // A passage told at the table is told to the party: the members of this campaign, as the DM's own Tell does.
      const party = await supabase.from("party_members").select("id").eq("campaign_id", ctx.campaignId);
      if (party.error) throw party.error;
      const { error } = await supabase
        .from("canon_lore_passages")
        .update({
          told_at: now,
          told_session_id: ctx.campaignSessionId,
          player_visible_to: ((party.data ?? []) as Row[]).map((r) => str(r.id)),
        })
        .eq("id", brought.id)
        .eq("campaign_id", ctx.campaignId)
        .is("told_at", null);
      if (error) throw error;
    },
  };
}
