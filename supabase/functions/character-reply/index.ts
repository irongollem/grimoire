// character-reply (#1021 row 26): a character played for an absent player answers a chat line that addresses it.
// The rules are `handler.ts`'s and `_shared/agent/standIn.ts`'s; this file wires the database and the model, with
// the provider, price and calibration lookups a turn of the AI table uses (`_shared/agent/providerIo.ts`).
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { generationRefusal } from "../_shared/accountGate.ts";
import { screenChatText } from "../_shared/moderation.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { judge, JEV_MODEL, judgingKey } from "../_shared/typesafe.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { STAND_IN_RECENT_LINES, type StandIn } from "../_shared/agent/standIn.ts";
import { loadPartyMember } from "../_shared/agent/characterIo.ts";
import type { StoredMention } from "../../../src/lib/chat/chatMentions.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { tableAiEnabled } from "../_shared/featureAccess.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { UNPROMPTED_JUDGE_TIMEOUT_MS } from "./unprompted.ts";
import { answerChatLine, GENERATION, type ReplyCampaign, type ReplyDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
/** The newest memories a character is given: what it lived through lately, not its whole ledger. */
const MEMORIES_SHOWN = 12;

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

serve(serveUser(async ({ user, req, report }) => {
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

  // The campaign `loadCampaign` read, kept for the provider lookup; resolved once.
  let campaignRow: ReplyCampaign | null = null;
  let resolved: Awaited<ReturnType<typeof resolveAgentProvider>> | undefined;
  const provider = async () => {
    if (resolved === undefined) resolved = campaignRow ? await resolveAgentProvider(admin) : null;
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

    // Whoever typed the line sits at the campaign; the owner pays, whoever asked. The AI switch is the handler's
    // (`aiOn`), because AI off is a quiet "nobody answered" rather than a refusal.
    async loadCampaign(campaignId, userId) {
      const load = await loadAiCampaign<ReplyCampaign>(admin, campaignId, userId, {
        access: "member", aiSwitch: false, forbiddenMessage: "Only someone at this campaign can ask its characters to answer.",
      });
      if (load.ok) campaignRow = load.campaign;
      return load;
    },

    aiOn: async (campaign) => (await tableAiEnabled(admin, campaign)) === true,

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
      const verdict = await screenChatText(text, { apiKey: (await provider())?.moderationKey ?? null, admin, userId: senderId, surface: GENERATION });
      return verdict?.flagged === true;
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

    // The one who types pays nothing, so the brake on them is the rate limit every generator shares. It is checked here,
    // where a character is about to speak, not on arrival: every public line is asked about while someone is played,
    // and a line no character answers (most of them) must not use up the sender's own allowance.
    rateLimit: (userId) => checkRateLimit(admin, userId, "chat_line"),

    async withHold(ownerId, credits, work) {
      return withCreditHold(admin, { payerId: ownerId, reason: GENERATION, cost: credits, report }, work);
    },

    // As the service role, in the name of the character's own player where it has one, so they find what their
    // character said (a whisper too) when they are back; an unclaimed character's lines are the Dungeon Master's.
    // `ai` marks the line as written by AI for every reader (AI Act Art. 50); `reply_to` is what makes asking twice answer once.
    async postReply({ line, character, ownerId, text, recipientUserId, provider: by, model, unprompted }) {
      const { error } = await admin.from("campaign_messages").insert({
        campaign_id: line.campaign_id,
        user_id: character.playerUserId ?? ownerId,
        recipient_user_id: recipientUserId,
        sender_name: character.name,
        message: text,
        type: "chat",
        metadata: { for_party_member_id: character.id, ai: true, reply_to: line.id, ...(unprompted ? { unprompted: true } : {}), ai_provenance: { generatorType: GENERATION, provider: by, model, generatedAt: new Date().toISOString(), edited: false } },
      });
      if (error) throw error;
    },

    // The rest of the party by name (`KnownThings` says why not quests).
    async loadPartyNames(campaignId) {
      const { data, error } = await admin.from("party_members").select("id, name").eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []).flatMap((row) => (typeof row.name === "string" ? [{ id: row.id as string, name: row.name }] : []));
    },

    async countUnprompted(campaignId, partyMemberId, sinceIso) {
      const { count, error } = await admin
        .from("campaign_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("metadata->>for_party_member_id", partyMemberId)
        .eq("metadata->>unprompted", "true")
        .gte("created_at", sinceIso);
      if (error) throw error;
      if (count === null) throw new Error("the unprompted count came back empty");
      return count;
    },

    // Only the platform's own key judges: the line goes to a third party. Platform-paid, logged like the narration check.
    async judge(request) {
      const key = judgingKey(true, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
      if (key === null) return null;
      const result = await judge(request, { apiKey: key, timeoutMs: UNPROMPTED_JUDGE_TIMEOUT_MS });
      // Delta 0 on the table's owner, whose table it is; a failure to log costs a ledger row, never the judgment (it logs itself).
      if (campaignRow) await recordFreeGeneration(admin, campaignRow.user_id, "entity_judgment", { model: JEV_MODEL, provider: "typesafe", input_tokens: result.inputTokens });
      return result;
    },

    now: () => Date.now(),

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

  };

  return answerChatLine({ userId: user.id, body, deps });
}));
