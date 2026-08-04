import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { createNpc, queueNpcEmbedding } from "./useNpcs";
import { createItem } from "./useItems";
import { createNote, queueNoteEmbedding } from "./useNotes";
import { computeBalance } from "@/lib/downtime/downtimeBalance";
import { drawFromDeck } from "@/lib/downtime/downtimeDeck";
import {
  npcInsertFromSeed,
  itemInsertFromSeed,
  noteInsertFromSeed,
} from "@/lib/downtime/downtimeSeedReward";
import {
  applyCoinEffects,
  applyConditionEffects,
  applyHpEffects,
  hasApplicableMemberEffect,
} from "@/lib/downtime/downtimeEffects";
import { DOWNTIME_SEEDS } from "@/data/downtimeSeeds";
import type { AiProvenance } from "@/ai/provenance";
import type {
  CoinKey,
  DowntimeDeckBack,
  DowntimeDeckBackInsert,
  DowntimeDraw,
  DowntimeEffect,
  DowntimeGrant,
  DowntimeGrantInsert,
  DowntimeOutcome,
  DrawResult,
} from "@/types/downtime.types";

/**
 * Single key for the whole domain. `useCampaignLiveSync` invalidates on exactly
 * this string, so every downtime query must share it as its first key element.
 */
const DOWNTIME_KEY = "downtime";

// ── Fetchers ─────────────────────────────────────────────────────────────────
// RLS does the scoping: a DM sees the whole campaign, a player sees only rows
// for the character they play. Neither query filters by user.

async function fetchGrants(campaignId: string): Promise<DowntimeGrant[]> {
  const { data, error } = await supabase
    .from("downtime_grants")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as DowntimeGrant[];
}

async function fetchDraws(campaignId: string): Promise<DowntimeDraw[]> {
  const { data, error } = await supabase
    .from("downtime_draws")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as DowntimeDraw[];
}

async function fetchOutcomes(campaignId: string): Promise<DowntimeOutcome[]> {
  const { data, error } = await supabase
    .from("downtime_outcomes")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as DowntimeOutcome[];
}

/** DM-only by RLS — the prepped pile is hidden prep, never visible to players. */
async function fetchDeckBacks(campaignId: string): Promise<DowntimeDeckBack[]> {
  const { data, error } = await supabase
    .from("downtime_deck_backs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as DowntimeDeckBack[];
}

// ── Queries ──────────────────────────────────────────────────────────────────

function useCampaignId() {
  const campaign = useCampaignStore();
  return computed(() => campaign.activeCampaignId);
}

export function useDowntimeGrants() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [DOWNTIME_KEY, campaignId.value, "grants"]),
    queryFn: () => fetchGrants(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useDowntimeDraws() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [DOWNTIME_KEY, campaignId.value, "draws"]),
    queryFn: () => fetchDraws(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useDowntimeOutcomes() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [DOWNTIME_KEY, campaignId.value, "outcomes"]),
    queryFn: () => fetchOutcomes(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useDeckBacks() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [DOWNTIME_KEY, campaignId.value, "backs"]),
    queryFn: () => fetchDeckBacks(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/**
 * Unspent draws for one character.
 *
 * Null means "not knowable yet" — either the ledger is still loading, or this
 * user plays no character in this campaign. It does NOT mean zero: a caller must
 * distinguish "you have 0 draws" from "there is no you to have draws", so the UI
 * can hide the board rather than render a misleading 0.
 */
export function useDowntimeBalance(partyMemberId: Ref<string | null>) {
  const { data: grants } = useDowntimeGrants();
  const { data: draws } = useDowntimeDraws();
  return computed<number | null>(() => {
    const id = partyMemberId.value;
    if (!id) return null;
    if (!grants.value || !draws.value) return null;
    const mine = grants.value.filter((g) => g.party_member_id === id);
    const spent = draws.value.filter((d) => d.party_member_id === id);
    return computeBalance(mine, spent);
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

function useInvalidateDowntime() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [DOWNTIME_KEY] });
}

/** DM mints credits. A plain insert — RLS gates it on `private.is_campaign_dm`. */
export function useGrantDowntime() {
  const campaign = useCampaignStore();
  const invalidate = useInvalidateDowntime();
  return useMutation({
    mutationFn: async (grant: DowntimeGrantInsert): Promise<DowntimeGrant> => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("downtime_grants")
        .insert({
          ...grant,
          campaign_id: campaign.activeCampaignId,
          granted_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DowntimeGrant;
    },
    onSuccess: invalidate,
  });
}

/**
 * Player spends a credit. Goes through the RPC, never a direct insert: the
 * balance check and the insert must be atomic, and the character is derived
 * server-side from auth.uid() rather than trusted from here.
 */
export function useSpendDraw() {
  const campaign = useCampaignStore();
  const invalidate = useInvalidateDowntime();
  return useMutation({
    mutationFn: async (activityKey: string): Promise<DowntimeDraw> => {
      const { data, error } = await supabase.rpc("spend_downtime_draw", {
        p_campaign_id: campaign.activeCampaignId,
        p_activity_key: activityKey,
      });
      if (error) throw error;
      return data as DowntimeDraw;
    },
    onSuccess: invalidate,
  });
}

/** DM cancels a pending draw, refunding the credit. */
export function useCancelDraw() {
  const invalidate = useInvalidateDowntime();
  return useMutation({
    mutationFn: async (drawId: string): Promise<void> => {
      const { error } = await supabase
        .from("downtime_draws")
        .update({ status: "cancelled" })
        .eq("id", drawId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export interface ResolveDrawPayload {
  draw: DowntimeDraw;
  title: string;
  vignette: string | null;
  effects: DowntimeEffect[];
  /** What the deck yielded. Null means the DM resolves with no reward attached. */
  result: DrawResult | null;
  /** Set when the title/vignette came from an AI draft (#606). Null for a
   *  prepped back, a system-deck seed, or a hand-written resolution. */
  ai_provenance?: AiProvenance | null;
}

/**
 * DM resolves a pending draw.
 *
 * When the deck yielded a seed, the NPC is created FIRST as an ordinary
 * RLS-checked insert, then its id is handed to the RPC — so the SECURITY DEFINER
 * function never creates entities on the caller's behalf. The RPC ties the
 * outcome, the draw's closure, and the prepped back's consumption into one
 * transaction.
 */
export function useResolveDraw() {
  const invalidate = useInvalidateDowntime();
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();

  return useMutation({
    mutationFn: async (payload: ResolveDrawPayload): Promise<DowntimeOutcome> => {
      const { draw, title, vignette, effects, result, ai_provenance } = payload;

      let rewardType: string | null = null;
      let rewardId: string | null = null;
      let backId: string | null = null;

      if (result?.source === "prepped") {
        // The DM already authored this entity; just point at it.
        rewardType = result.back.reward_type;
        rewardId = result.back.reward_id;
        backId = result.back.id;
      } else if (result?.source === "seed") {
        // Mint the seed's reward as an ordinary RLS-checked insert BEFORE the
        // RPC, then hand its id in — so the SECURITY DEFINER function never
        // creates entities on the caller's behalf. Dispatch on the reward kind;
        // every kind here has a builder in downtimeSeedReward.ts.
        const campaignId = campaign.activeCampaignId!;
        const reward = result.seed.reward;
        if (reward.kind === "npc") {
          const npc = await createNpc({
            ...npcInsertFromSeed(reward.npc),
            campaign_id: campaignId,
          });
          // Direct createNpc() bypasses useCreateNpc()'s embed hook — queue
          // explicitly, or the reward NPC stays unretrievable until the next
          // admin backfill (same gap useCloneLibraryMonster documents).
          queueNpcEmbedding(npc.id);
          rewardType = "npc";
          rewardId = npc.id;
        } else if (reward.kind === "item") {
          const item = await createItem({
            ...itemInsertFromSeed(reward.item),
            campaign_id: campaignId,
          });
          rewardType = "item";
          rewardId = item.id;
        } else if (reward.kind === "note") {
          const note = await createNote({
            ...noteInsertFromSeed(reward.note),
            campaign_id: campaignId,
          });
          queueNoteEmbedding(note.id);
          rewardType = "note";
          rewardId = note.id;
        }
      }

      const { data, error } = await supabase.rpc("resolve_downtime_draw", {
        p_draw_id: draw.id,
        p_title: title,
        p_vignette: vignette,
        p_reward_type: rewardType,
        p_reward_id: rewardId,
        p_effects: effects,
        p_back_id: backId,
        p_ai_provenance: ai_provenance ?? null,
      });
      if (error) throw error;
      return data as DowntimeOutcome;
    },
    onSuccess: () => {
      invalidate();
      // A resolved seed draw mints an entity — refresh whichever list it lands
      // in. Cheaper to invalidate all three than to thread the reward kind out.
      void queryClient.invalidateQueries({ queryKey: ["npcs"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

/**
 * Apply the ticked effects the app can enact — coin, HP, and conditions — to the
 * character who drew. `party_members` carries cp/sp/ep/gp/pp, current_hp/max_hp,
 * and a `conditions` array, so all three are safe and verifiable. The `item`
 * kind still renders as a checklist the DM performs by hand (it names an item to
 * drop into inventory, which the effect alone can't safely resolve) — a named
 * limit, not an oversight.
 *
 * All three write to the same `party_members` row, so a single read-modify-write
 * applies them together. That is acceptable: only the DM resolves draws, so
 * there is no concurrent writer to race against.
 */
export function useApplyEffects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      partyMemberId: string;
      effects: DowntimeEffect[];
    }): Promise<void> => {
      if (!hasApplicableMemberEffect(args.effects)) return;

      const { data: member, error: readError } = await supabase
        .from("party_members")
        .select("cp, sp, ep, gp, pp, current_hp, max_hp, conditions")
        .eq("id", args.partyMemberId)
        .single();
      if (readError) throw readError;

      const row = member as Record<CoinKey, number> & {
        current_hp: number;
        max_hp: number;
        conditions: string[];
      };

      const coins = applyCoinEffects(
        { pp: row.pp, gp: row.gp, ep: row.ep, sp: row.sp, cp: row.cp },
        args.effects,
      );
      const currentHp = applyHpEffects(row.current_hp, row.max_hp, args.effects);
      const conditions = applyConditionEffects(row.conditions ?? [], args.effects);

      const { error: writeError } = await supabase
        .from("party_members")
        .update({ ...coins, current_hp: currentHp, conditions })
        .eq("id", args.partyMemberId);
      if (writeError) throw writeError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["party"] }),
  });
}

// ── Prepped backs ("stack the deck") ─────────────────────────────────────────

export function useCreateDeckBack() {
  const campaign = useCampaignStore();
  const invalidate = useInvalidateDowntime();
  return useMutation({
    mutationFn: async (back: DowntimeDeckBackInsert): Promise<DowntimeDeckBack> => {
      const { data, error } = await supabase
        .from("downtime_deck_backs")
        .insert({ ...back, campaign_id: campaign.activeCampaignId })
        .select()
        .single();
      if (error) throw error;
      return data as DowntimeDeckBack;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDeckBack() {
  const invalidate = useInvalidateDowntime();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("downtime_deck_backs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/**
 * What this draw would yield right now — prepped back first, else a weighted
 * seed. The DM sees this on the resolution board before committing.
 *
 * `Math.random` is bound here, at the edge; `drawFromDeck` itself stays pure.
 */
export function previewDraw(
  activityKey: string,
  backs: readonly DowntimeDeckBack[],
): DrawResult | null {
  return drawFromDeck(activityKey, backs, DOWNTIME_SEEDS, Math.random);
}
