// campaign-prep (#1021 row 22): what a campaign's story will need and does not have, proposed to its Dungeon Master
// and made only from what they keep. The rules are `handler.ts`'s; this file wires the database and the model, with
// the provider, price and calibration lookups a turn of the table uses.
import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generationRefusal } from "../_shared/accountGate.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { closedLevels, questIdsForTitles, rollTableEntries, type PrepDigest } from "../_shared/campaignPrep.ts";
import { prepCampaign, type PrepCampaign, type PrepDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** How much of a campaign is read: enough to see what its story needs, bounded so a huge campaign still fits. */
const QUESTS_MAX = 40;
const BEATS_MAX = 200;
const NAMES_MAX = 400;

/** How the campaign levels its party, and the milestones it has, with the titles of the quests each waits on. */
async function loadLevelling(admin: SupabaseClient, campaignId: string): Promise<PrepDigest["levelling"]> {
  const [campaign, rule, milestones] = await Promise.all([
    admin.from("campaigns").select("party_level").eq("id", campaignId).maybeSingle(),
    admin.from("campaign_rules").select("enabled").eq("campaign_id", campaignId).eq("rule_key", "xp_levelling").maybeSingle(),
    admin.from("level_milestones")
      .select("level, needs, steps:level_milestone_steps!level_milestone_steps_milestone_id_fkey(quest:quests!level_milestone_steps_quest_id_fkey(title), objective:quest_objectives!level_milestone_steps_objective_id_fkey(description))")
      .eq("campaign_id", campaignId)
      .order("level", { ascending: true }),
  ]);
  for (const r of [campaign, rule, milestones]) if (r.error) throw r.error;
  type Row = { level: number; needs: number; steps: Array<{ quest: { title: string } | null; objective: { description: string } | null }> };
  return {
    // No rule row is the rule's default, which is off: by milestone.
    mode: rule.data?.enabled === true ? "experience" : "milestone",
    partyLevel: typeof campaign.data?.party_level === "number" ? campaign.data.party_level : null,
    milestones: ((milestones.data ?? []) as unknown as Row[]).map((m) => ({
      level: m.level,
      needs: m.needs,
      quests: m.steps.flatMap((s) => (s.quest ? [s.quest.title] : s.objective ? [s.objective.description] : [])),
    })),
  };
}

const lower = (rows: Array<{ name: unknown }> | null): Set<string> => new Set((rows ?? []).flatMap((r) => (typeof r.name === "string" ? [r.name.trim().toLowerCase()] : [])));

serve(serveUser(async ({ user, req, report, userClient: supabase }) => {
  // Fail closed, as a turn of the table does: a model is not called on an account a lookup could not clear.
  const gate = await generationRefusal(admin, user.id, { failClosed: true });
  if (gate) return gate;

  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

  const deps: PrepDeps = {
    // The DM only, and anyone else is told the campaign does not exist: a 403 would say it does.
    loadCampaign: (campaignId, userId) =>
      loadAiCampaign<PrepCampaign>(admin, campaignId, userId, { columns: ["name", "text_provider"], aiSwitch: "table", hideFromOutsiders: true }),

    async loadDigest(campaign): Promise<PrepDigest> {
      const [quests, beats, places, hazards, items, tables, features, levelling] = await Promise.all([
        admin.from("quests").select("id, title, summary").eq("campaign_id", campaign.id).order("created_at", { ascending: true }).limit(QUESTS_MAX),
        admin.from("quest_beats").select("quest_id, title, how_it_plays, read_aloud, dm_content").eq("campaign_id", campaign.id).order("created_at", { ascending: true }).limit(BEATS_MAX),
        admin.from("locations").select("id, name, location_type, terrain, parent_id").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("traps").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("items").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("roll_tables").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        admin.from("dungeon_features").select("name").eq("campaign_id", campaign.id).limit(NAMES_MAX),
        loadLevelling(admin, campaign.id),
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
        levelling,
      };
    },

    // The campaign's own names by kind, and the library's hazards: what exists is not proposed or made again.
    async loadExisting(campaignId) {
      const [traps, libraryTraps, places, items, tables, features, levelling] = await Promise.all([
        admin.from("traps").select("name").eq("campaign_id", campaignId),
        admin.from("library_traps").select("name"),
        admin.from("locations").select("name").eq("campaign_id", campaignId),
        admin.from("items").select("name").eq("campaign_id", campaignId),
        admin.from("roll_tables").select("name").eq("campaign_id", campaignId),
        admin.from("dungeon_features").select("name").eq("campaign_id", campaignId),
        loadLevelling(admin, campaignId),
      ]);
      for (const r of [traps, libraryTraps, places, items, tables, features]) if (r.error) throw r.error;
      return {
        hazard: new Set([...lower(traps.data), ...lower(libraryTraps.data)]), place: lower(places.data), item: lower(items.data), roll_table: lower(tables.data), feature: lower(features.data),
        milestone: closedLevels(levelling),
      };
    },

    async resolveProvider(campaign) {
      const resolved = await resolveAgentProvider(admin, { id: campaign.id, ownerId: campaign.user_id, textProvider: campaign.text_provider });
      return resolved === null ? null : resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    withHold: (credits, work) => withCreditHold(admin, { payerId: user.id, reason: "campaign_prep", cost: credits, report }, work),

    // Ordinary campaign content, marked as made by AI. Written as the caller, so the tables' own rules decide
    // (their policies, and a plan's limits): a record the DM could not have made by hand is not made here either.
    async make({ campaign, userId }, proposal) {
      // The mark names the model that proposes for this campaign: the same lookup the proposing step made.
      const resolved = await resolveAgentProvider(admin, { id: campaign.id, ownerId: campaign.user_id, textProvider: campaign.text_provider });
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
      if (proposal.kind === "milestone") {
        // The quests by their titles, as the model read them; a title the campaign does not have makes nothing.
        const { data: rows, error } = await supabase.from("quests").select("id, title").eq("campaign_id", campaign.id);
        fail(error);
        const matched = questIdsForTitles((rows ?? []) as Array<{ id: string; title: string }>, proposal.quests);
        if (!matched.ok) throw new Error(matched.reason);
        const ids = matched.ids;
        // The editor's own call: written as the DM, under the same rules.
        fail((await supabase.rpc("save_level_milestone", {
          p_campaign_id: campaign.id, p_milestone_id: null, p_level: proposal.level, p_needs: proposal.needs,
          p_note: proposal.description.slice(0, 280), p_quest_ids: ids, p_objective_ids: [],
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

  return prepCampaign({ userId: user.id, body, deps });
}));
