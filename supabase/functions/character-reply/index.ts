// character-reply (#1021 row 26): a character played for an absent player answers a chat line that addresses it.
// The rules are `handler.ts`'s and `_shared/agent/standIn.ts`'s; this file wires the database and the model, with
// the provider, price and calibration lookups a turn of the AI table uses (`_shared/agent/providerIo.ts`).
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { tableAiEnabled } from "../_shared/featureAccess.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { recordFreeGeneration, recordGeneration, releaseCredits, reserveCredits } from "../_shared/credits.ts";
import { isPromptRejected, screenImagePrompt } from "../_shared/moderation.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { STAND_IN_RECENT_LINES, type StandIn } from "../_shared/agent/standIn.ts";
import { loadPartyMember } from "../agent-turn/characterIo.ts";
import type { StoredMention } from "../../../src/lib/chat/chatMentions.ts";
import { answerChatLine, type ReplyDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GENERATION = "character_reply";
/** The newest memories a character is given: what it lived through lately, not its whole ledger. */
const MEMORIES_SHOWN = 12;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** `metadata.mentions` as it was stored by a browser: anything not shaped like a mention is dropped. */
function mentionsOf(metadata: unknown): StoredMention[] {
  const list = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>).mentions : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((m): StoredMention[] => {
    if (typeof m !== "object" || m === null) return [];
    const { kind, party_member_id: id, name } = m as Record<string, unknown>;
    if (kind !== "member" && kind !== "dm" && kind !== "party") return [];
    if (kind === "member" && typeof id !== "string") return [];
    return [{ kind, party_member_id: kind === "member" ? (id as string) : null, name: typeof name === "string" ? name.slice(0, 120) : "" }];
  });
}

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

  // The one who types pays nothing, so the brake on them is the rate limit every generator shares.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return json(429, { error: "rate_limited" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // The campaign row with its key columns, kept from `loadCampaign` for the provider lookup; resolved once.
  let rawCampaign: Record<string, unknown> | null = null;
  let ownerId: string | null = null;
  let resolved: Awaited<ReturnType<typeof resolveAgentProvider>> | undefined;
  const provider = async () => {
    if (resolved === undefined) resolved = rawCampaign && ownerId ? await resolveAgentProvider(admin, { ownerId, raw: rawCampaign }) : null;
    return resolved;
  };

  const deps: ReplyDeps = {
    async loadLine(messageId) {
      const { data, error } = await admin
        .from("campaign_messages")
        .select("id, campaign_id, user_id, recipient_user_id, type, sender_name, message, metadata")
        .eq("id", messageId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        campaign_id: data.campaign_id as string,
        user_id: data.user_id as string,
        recipient_user_id: (data.recipient_user_id as string | null) ?? null,
        type: data.type as string,
        sender_name: (data.sender_name as string | null) ?? null,
        message: data.message as string,
        mentions: mentionsOf(data.metadata),
      };
    },

    async loadCampaign(campaignId) {
      const { data, error } = await admin
        .from("campaigns")
        .select("id, user_id, ai_enabled, text_provider, openai_api_key, anthropic_api_key, gemini_api_key")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      rawCampaign = data;
      ownerId = data.user_id as string;
      return { id: data.id as string, user_id: data.user_id as string, ai_enabled: await tableAiEnabled(admin, data) };
    },

    // Only the characters both words are given for are read in full: the rest could not answer anyway.
    async loadParty(campaignId) {
      const flagged = await admin.from("party_members").select("id").eq("campaign_id", campaignId).eq("ai_speaks", true).eq("ai_stands_in", true);
      if (flagged.error) throw flagged.error;
      const ids = (flagged.data ?? []).map((row) => row.id as string);
      if (ids.length === 0) return [];
      const links = await admin.from("campaign_members").select("user_id, party_member_id").eq("campaign_id", campaignId).in("party_member_id", ids);
      if (links.error) throw links.error;
      const playerOf = new Map((links.data ?? []).map((row) => [row.party_member_id as string, row.user_id as string]));
      const party: StandIn[] = [];
      for (const id of ids) {
        // A child's character is not played by AI among adults, whatever its sheet says, and neither is a suspended
        // account's: the same gate that stops those accounts generating, failing closed.
        const player = playerOf.get(id);
        if (player !== undefined && (await generationRefusal(admin, player, { failClosed: true })) !== null) continue;
        const member = await loadPartyMember(admin, campaignId, id);
        if (member !== null) party.push({ ...member, aiSpeaks: true, standsIn: true, playerUserId: playerOf.get(id) ?? null });
      }
      return party;
    },

    async answeredBy(messageId) {
      const { data, error } = await admin.from("campaign_messages").select("metadata").eq("metadata->>reply_to", messageId);
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const id = (row.metadata as Record<string, unknown> | null)?.for_party_member_id;
        return typeof id === "string" ? [id] : [];
      });
    },

    // Fail closed: a character is not played on the credits of an account a lookup could not clear.
    ownerRefused: async (owner) => (await generationRefusal(admin, owner, { failClosed: true })) !== null,

    async isFlagged(text, senderId) {
      try {
        await screenImagePrompt(text, { apiKey: (await provider())?.moderationKey ?? null, admin, userId: senderId, generationType: GENERATION, imageProvider: "none" });
        return false;
      } catch (error) {
        if (isPromptRejected(error)) return true;
        throw error;
      }
    },

    resolveProvider: async () => (await provider())?.provider ?? null,
    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    async loadMemories(campaignId, partyMemberId) {
      const { data, error } = await admin
        .from("party_member_memories")
        .select("body")
        .eq("party_member_id", partyMemberId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(MEMORIES_SHOWN);
      if (error) throw error;
      return (data ?? []).reverse().map((row) => row.body as string);
    },

    // Public lines only (`recipient_user_id is null`): a whisper between two others is never shown to a character.
    async loadRecent(line) {
      const { data, error } = await admin
        .from("campaign_messages")
        .select("id, sender_name, message, created_at")
        .eq("campaign_id", line.campaign_id)
        .eq("type", "chat")
        .is("recipient_user_id", null)
        .neq("id", line.id)
        .order("created_at", { ascending: false })
        .limit(STAND_IN_RECENT_LINES);
      if (error) throw error;
      return (data ?? []).reverse().map((row) => ({ from: (row.sender_name as string | null) ?? "Someone", text: row.message as string }));
    },

    async reserve(owner, credits) {
      const reservation = await reserveCredits(admin, owner, credits, GENERATION);
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      return { ok: false, status: 402, error: "insufficient_credits" };
    },
    release: (ids) => releaseCredits(admin, ids),

    // As the service role, in the name of the character's own player where it has one, so they find what their
    // character said (a whisper too) when they are back; an unclaimed character's lines are the Dungeon Master's.
    // `ai` marks the line as written by AI for every reader (AI Act Art. 50); `reply_to` is what makes asking twice answer once.
    async postReply({ line, character, text, recipientUserId, provider: by, model }) {
      const { error } = await admin.from("campaign_messages").insert({
        campaign_id: line.campaign_id,
        user_id: character.playerUserId ?? ownerId,
        recipient_user_id: recipientUserId,
        sender_name: character.name,
        message: text,
        type: "chat",
        metadata: { for_party_member_id: character.id, ai: true, reply_to: line.id, ai_provenance: { generatorType: GENERATION, provider: by, model, generatedAt: new Date().toISOString(), edited: false } },
      });
      if (error) throw error;
    },

    async fileMemory({ campaignId, partyMemberId, ownerId: owner, body: text, provider: by, model }) {
      const { error } = await admin.from("party_member_memories").insert({
        campaign_id: campaignId,
        party_member_id: partyMemberId,
        user_id: owner,
        kind: "event",
        body: text,
        ai_provenance: { generatorType: `${GENERATION}_memory`, provider: by, model, generatedAt: new Date().toISOString(), edited: false },
      });
      if (error) throw error;
    },

    charge: (owner, isByok, credits, log) => recordGeneration(admin, owner, GENERATION, isByok, credits, log),
    logUncharged: (owner, isByok, log) => (isByok ? recordGeneration(admin, owner, GENERATION, true, 0, log) : recordFreeGeneration(admin, owner, GENERATION, log)),
  };

  try {
    const outcome = await answerChatLine({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.status, { error: outcome.error });
    return json(200, { replies: outcome.replies });
  } catch (error) {
    console.error("character-reply failed:", error);
    return json(500, { error: "The character could not answer right now. Nothing was charged." });
  }
}));
