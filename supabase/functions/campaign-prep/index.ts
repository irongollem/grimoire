// campaign-prep (#1021 row 22): what a campaign's story will need and does not have, proposed to its Dungeon Master
// and made only from what they keep. The rules are `handler.ts`'s; this file wires the database and the model, with
// the provider, price and calibration lookups a turn of the table uses.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { tableAiEnabled } from "../_shared/featureAccess.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { recordGeneration, releaseCredits, reserveCredits, reservationRefusal } from "../_shared/credits.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { rollTableEntries, type PrepDigest } from "../_shared/campaignPrep.ts";
import { prepCampaign, type PrepDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** How much of a campaign is read: enough to see what its story needs, bounded so a huge campaign still fits. */
const QUESTS_MAX = 40;
const BEATS_MAX = 200;
const NAMES_MAX = 400;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const lower = (rows: Array<{ name: unknown }> | null): Set<string> => new Set((rows ?? []).flatMap((r) => (typeof r.name === "string" ? [r.name.trim().toLowerCase()] : [])));

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  // Fail closed, as a turn of the table does: a model is not called on an account a lookup could not clear.
  const gate = await generationRefusal(admin, user.id, { failClosed: true });
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  let rawCampaign: Record<string, unknown> | null = null;

  const deps: PrepDeps = {
    async loadCampaign(campaignId) {
      const { data, error } = await admin
        .from("campaigns")
        .select("id, user_id, name, ai_enabled, text_provider, openai_api_key, anthropic_api_key, gemini_api_key")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      rawCampaign = data;
      return { id: data.id as string, user_id: data.user_id as string, name: data.name as string, ai_enabled: await tableAiEnabled(admin, data) };
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),

    async loadDigest(campaign): Promise<PrepDigest> {
      const [quests, beats, places, hazards, items, tables, features] = await Promise.all([
        admin.from("quests").select("id, title, summary").eq("campaign_id", campaign.id).order("created_at", { ascending: true }).limit(QUESTS_MAX),
        admin.from("quest_beats").select("quest_id, title, how_it_plays, read_aloud, dm_content").eq("campaign_id", campaign.id).order("created_at", { ascending: true }).limit(BEATS_MAX),
        admin.from("locations").select("id, name, location_type, terrain, parent_id").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("traps").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("items").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("roll_tables").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("dungeon_features").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
      ]);
      for (const r of [quests, beats, places, hazards, items, tables, features]) if (r.error) throw r.error;
      const placeName = new Map((places.data ?? []).map((p) => [p.id as string, p.name as string]));
      return {
        campaign: campaign.name,
        quests: (quests.data ?? []).map((q) => ({
          title: (q.title as string | null) ?? "Untitled quest",
          summary: toPlainText(q.summary as string | null) || null,
          beats: (beats.data ?? [])
            .filter((b) => b.quest_id === q.id)
            .map((b) => ({
              title: (b.title as string | null) ?? "Untitled beat",
              text: [b.how_it_plays, b.read_aloud, b.dm_content].map((t) => toPlainText(t as string | null)).filter((t) => t !== "").join(" ") || null,
            })),
        })),
        places: (places.data ?? []).map((p) => ({
          name: p.name as string,
          type: (p.location_type as string | null) ?? null,
          terrain: (p.terrain as string | null) ?? null,
          inside: p.parent_id ? (placeName.get(p.parent_id as string) ?? null) : null,
        })),
        hazards: (hazards.data ?? []).map((h) => h.name as string),
        items: (items.data ?? []).map((i) => i.name as string),
        tables: (tables.data ?? []).map((t) => t.name as string),
        features: (features.data ?? []).map((f) => f.name as string),
      };
    },

    // The campaign's own names by kind, and the library's hazards: what exists is not proposed or made again.
    async loadExisting(campaignId) {
      const [traps, libraryTraps, places, items, tables, features] = await Promise.all([
        admin.from("traps").select("name").eq("campaign_id", campaignId),
        admin.from("library_traps").select("name"),
        admin.from("locations").select("name").eq("campaign_id", campaignId),
        admin.from("items").select("name").eq("campaign_id", campaignId),
        admin.from("roll_tables").select("name").eq("campaign_id", campaignId),
        admin.from("dungeon_features").select("name").eq("campaign_id", campaignId),
      ]);
      for (const r of [traps, libraryTraps, places, items, tables, features]) if (r.error) throw r.error;
      return { hazard: new Set([...lower(traps.data), ...lower(libraryTraps.data)]), place: lower(places.data), item: lower(items.data), roll_table: lower(tables.data), feature: lower(features.data) };
    },

    async resolveProvider(campaign) {
      if (!rawCampaign) return null;
      const resolved = await resolveAgentProvider(admin, { ownerId: campaign.user_id, raw: rawCampaign });
      return resolved === null ? null : resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    async reserve(userId, credits) {
      const reservation = await reserveCredits(admin, userId, credits, "campaign_prep");
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      return { ok: false, ...reservationRefusal(reservation, "The prep cannot be metered right now.") };
    },

    release: (ids) => releaseCredits(admin, ids),
    charge: (userId, isByok, credits, log) => recordGeneration(admin, userId, "campaign_prep", isByok, credits, log),

    // Ordinary campaign content, marked as made by AI. Written as the caller, so the tables' own rules decide
    // (their policies, and a plan's limits): a record the DM could not have made by hand is not made here either.
    async make({ campaign, userId }, proposal) {
      // The mark names the model that proposes for this campaign: the same lookup the proposing step made.
      const resolved = rawCampaign === null ? null : await resolveAgentProvider(admin, { ownerId: campaign.user_id, raw: rawCampaign });
      const mark = {
        generatorType: "campaign_prep",
        provider: resolved === null ? "unknown" : resolved.provider.provider,
        model: resolved === null ? "unknown" : resolved.provider.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      const fail = (error: { message: string } | null) => {
        if (error) throw new Error(error.message);
      };
      if (proposal.kind === "hazard") {
        const h = proposal.hazard;
        fail((await supabase.from("traps").insert({
          user_id: userId, campaign_id: campaign.id, name: h.name, trap_type: "Environmental", effect_description: h.effect,
          save_type: h.save, save_dc: h.dc, damage_entries: h.damage, damage_immunities: [], ai_provenance: mark,
        })).error);
        return;
      }
      if (proposal.kind === "place") {
        let parentId: string | null = null;
        if (proposal.inside !== null) {
          const exact = proposal.inside.replace(/[\\%_]/g, (c) => `\\${c}`);
          const parent = await supabase.from("locations").select("id").eq("campaign_id", campaign.id).ilike("name", exact).limit(1).maybeSingle();
          fail(parent.error);
          parentId = parent.data ? (parent.data.id as string) : null;
        }
        fail((await supabase.from("locations").insert({
          user_id: userId, campaign_id: campaign.id, parent_id: parentId, name: proposal.name, location_type: proposal.placeType,
          description: proposal.description, terrain: proposal.terrain, ai_provenance: mark,
        })).error);
        return;
      }
      if (proposal.kind === "feature") {
        fail((await supabase.from("dungeon_features").insert({
          user_id: userId, campaign_id: campaign.id, name: proposal.name, feature_type: proposal.featureType, description: proposal.description,
          perception_dc: proposal.findDc, contents_description: proposal.contents, ai_provenance: mark,
        })).error);
        return;
      }
      if (proposal.kind === "roll_table") {
        fail((await supabase.from("roll_tables").insert({
          user_id: userId, campaign_id: campaign.id, name: proposal.name, description: proposal.description, dice: proposal.dice,
          entries: rollTableEntries(proposal.dice, proposal.entries, () => crypto.randomUUID()), ai_provenance: mark,
        })).error);
        return;
      }
      fail((await supabase.from("items").insert({
        user_id: userId, campaign_id: campaign.id, name: proposal.name, item_type: proposal.itemType, rarity: proposal.rarity,
        description: proposal.description, ai_provenance: mark,
      })).error);
    },
  };

  try {
    const outcome = await prepCampaign({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.status, { error: outcome.error });
    return json(200, outcome.kind === "proposed" ? { proposals: outcome.proposals, credits: outcome.credits } : { made: outcome.made, skipped: outcome.skipped });
  } catch (error) {
    console.error("campaign-prep failed:", error);
    return json(500, { error: "The campaign could not be prepped right now. Nothing was charged." });
  }
}));
