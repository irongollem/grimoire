import { itemRefColumns } from "@/lib/itemRef";
import { ref, computed, watch, effectScope } from "vue";
import { supabase } from "@/lib/supabase";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/party/useParty";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import type { CampaignMessage, CampaignMessageInsert, ItemDropMetadata, CurrencyDropMetadata, VendorOfferMetadata, PlayerOfferMetadata, FlavorMetadata, LootChestMetadata } from "@/types/chat.types";
import { formatCoinParts } from "@/rules/currency";
import type { RollResult } from "@/lib/dice/dice";

const LIMIT = 100;

// ── Module-level singleton ─────────────────────────────────────────────────────
// All components that call useCampaignMessages() share the same messages array
// and the same realtime subscription — so sendRoll() from PlayerCharacterView
// immediately appears in CampaignChat without a refresh.

const messages = ref<CampaignMessage[]>([]);
const loading  = ref(false);
const loadingOlder = ref(false);
const hasOlder = ref(false);
let stopListening: (() => void) | null = null;
let subscribedCampaignId: string | null = null;
let generation = 0; // incremented each subscribe(); callbacks ignore stale gens
let latestFetchId = 0;
let deletedMessageIds = new Set<string>();
let oldestCursor: Pick<CampaignMessage, "created_at" | "id"> | null = null;

// ── Closed-chat cost (#999) ────────────────────────────────────────────────────
// The chat is mounted on every page so it can raise the unread dot, but until
// someone opens it nothing needs the 100-row history (`select *`, jsonb
// metadata and all). While it is closed only a narrow probe of the newest rows
// is read, enough for `resolveChatUnread` (id, time, sender, type, and the one
// metadata key it inspects). The first open, or any caller that renders the
// list, calls `loadHistory()`, which latches: from then on every refresh
// (campaign switch, reconnect) reads the full window as before. Realtime
// delivery is untouched and runs whether or not the chat is open.
const PROBE_LIMIT = 20;
type ProbeMessage = Pick<CampaignMessage, "id" | "campaign_id" | "user_id" | "recipient_user_id" | "type" | "created_at"> & {
  metadata: { skill_label: string } | null;
};
const unreadProbe = ref<ProbeMessage[]>([]);
let historyWanted = false;
let historyLoadedFor: string | null = null;

function compareMessages(a: Pick<CampaignMessage, "created_at" | "id">, b: Pick<CampaignMessage, "created_at" | "id">) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

function mergeMessages(incoming: CampaignMessage[]) {
  const merged = new Map<string, CampaignMessage>();
  for (const msg of messages.value) merged.set(msg.id, msg);
  for (const msg of incoming) merged.set(msg.id, msg);
  for (const id of deletedMessageIds) merged.delete(id);
  messages.value = [...merged.values()]
    .filter(isVisibleToCurrentUser)
    .sort(compareMessages);
}

function isVisibleToCurrentUser(msg: Pick<CampaignMessage, "type" | "recipient_user_id" | "user_id">): boolean {
  const auth = useAuthStore();
  const uid = auth.user?.id;
  // dm_roll: only the recipient (DM) sees it — sender never sees result
  if (msg.type === "dm_roll") return auth.isDM || msg.recipient_user_id === uid;
  // public or addressed to me or DM or I sent it (regular whisper)
  return msg.recipient_user_id === null || auth.isDM || msg.recipient_user_id === uid || msg.user_id === uid;
}

/**
 * After a ring, drop loaded rows that the newest window no longer contains.
 * Only rows at or after the window's oldest entry can be judged (older ones are
 * simply outside it); a short page means the window holds everything.
 */
function dropVanished(page: CampaignMessage[]) {
  const inPage = new Set(page.map((m) => m.id));
  const oldest = page.length === LIMIT ? page[page.length - 1] : null;
  messages.value = messages.value.filter(
    (m) => inPage.has(m.id) || (oldest !== null && compareMessages(m, oldest) < 0),
  );
}

async function fetchMessages(campaignId: string, expectedGeneration = generation, resetPagination = false, prune = false) {
  if (expectedGeneration !== generation || campaignId !== subscribedCampaignId) return;
  const fetchId = ++latestFetchId;
  loading.value = true;
  // Safety net: a request frozen by iOS only fails at its 30s deadline
  // (requestDeadline.ts); clear the spinner after 8s rather than wait for it.
  const bail = setTimeout(() => {
    if (fetchId === latestFetchId && expectedGeneration === generation) loading.value = false;
  }, 8_000);
  try {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      // Fetch the newest window, then restore chronological display order.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIMIT);
    // A request may finish after Realtime has already delivered a newer row.
    // Merge the HTTP snapshot underneath current socket state so the initial
    // history is retained without overwriting an insert/update/delete that won
    // the race.
    if (!error && expectedGeneration === generation && campaignId === subscribedCampaignId
      && fetchId === latestFetchId) {
      const page = (data ?? []) as CampaignMessage[];
      if (resetPagination) {
        oldestCursor = page.length
          ? { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id }
          : null;
        hasOlder.value = page.length === LIMIT;
      }
      if (prune) dropVanished(page);
      mergeMessages(page);
    }
  } catch {
    // Network error or deadline — just leave current messages
  } finally {
    clearTimeout(bail);
    if (fetchId === latestFetchId && expectedGeneration === generation) loading.value = false;
  }
}

async function fetchProbe(campaignId: string, expectedGeneration = generation) {
  if (expectedGeneration !== generation || campaignId !== subscribedCampaignId) return;
  try {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("id,campaign_id,user_id,recipient_user_id,type,created_at,skill_label:metadata->>skill_label")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PROBE_LIMIT);
    if (error || data === null || expectedGeneration !== generation || campaignId !== subscribedCampaignId) return;
    // The full window supersedes the probe; do not resurrect it after a load.
    if (historyLoadedFor === campaignId) return;
    const rows = data as unknown as Array<Omit<ProbeMessage, "metadata"> & { skill_label: string | null }>;
    unreadProbe.value = rows
      .filter(isVisibleToCurrentUser)
      .map(({ skill_label, ...row }) => ({
        ...row,
        metadata: skill_label ? { skill_label } : null,
      }));
  } catch {
    // The dot simply stays as it was; the next reconcile retries.
  }
}

/** Read whatever the current state calls for: the full window once the list has
 *  been wanted, the narrow unread probe until then. */
function refresh(campaignId: string, gen: number, resetPagination = false, prune = false) {
  if (historyWanted) {
    historyLoadedFor = campaignId;
    unreadProbe.value = [];
    void fetchMessages(campaignId, gen, resetPagination, prune);
  } else {
    void fetchProbe(campaignId, gen);
  }
}

/**
 * Fetch the chat history. Called when the chat opens (or by any surface that
 * renders the message list); idempotent per campaign. Once called, every later
 * campaign switch loads the full window directly.
 */
export function loadChatHistory() {
  ensureWatcher();
  historyWanted = true;
  const campaignId = subscribedCampaignId;
  if (!campaignId || historyLoadedFor === campaignId) return;
  historyLoadedFor = campaignId;
  unreadProbe.value = [];
  void fetchMessages(campaignId, generation, true);
}

async function loadOlder() {
  const campaignId = subscribedCampaignId;
  const cursor = oldestCursor;
  const myGen = generation;
  if (!campaignId || !cursor || !hasOlder.value || loadingOlder.value) return;

  loadingOlder.value = true;
  try {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      // The cursor is stable even when several messages share a timestamp.
      .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIMIT);
    if (error || myGen !== generation || campaignId !== subscribedCampaignId) return;

    const page = (data ?? []) as CampaignMessage[];
    if (page.length) {
      oldestCursor = { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id };
      mergeMessages(page);
    }
    hasOlder.value = page.length === LIMIT;
  } catch {
    // Keep the current page and allow the user to retry by scrolling again.
  } finally {
    if (myGen === generation) loadingOlder.value = false;
  }
}

/**
 * Listen for the campaign's rings (the doorbell, #999 4.2) instead of a channel
 * of our own. A ring names the table, never the row, so the answer to "something
 * changed in chat" is a read of the newest window: one request per ring, which
 * replaces the old per-row INSERT/UPDATE/DELETE payloads. The window is merged
 * under the loaded list, so older pages the user scrolled back to survive, and
 * the pruning pass below drops rows another client deleted (a merge alone would
 * keep them). The channel itself belongs to useCampaignLiveSync, which also
 * tells us through `onCampaignReconcile` when rings may have been missed.
 */
function subscribe(campaignId: string, clearMessages = false) {
  stopListening?.();
  subscribedCampaignId = campaignId;
  const myGen = ++generation;
  if (clearMessages) {
    messages.value = [];
    unreadProbe.value = [];
    historyLoadedFor = null;
    deletedMessageIds = new Set();
    oldestCursor = null;
    hasOlder.value = false;
    loadingOlder.value = false;
  }
  const current = () => myGen === generation && subscribedCampaignId === campaignId;
  const offRing = onCampaignRing(["campaign_messages"], (ring) => {
    if (ring.campaignId !== campaignId || !current()) return;
    // This tab's own sends, claims and deletes already updated the list from
    // their responses; a refetch would only repeat them.
    if (ring.own) return;
    refresh(campaignId, myGen, false, true);
  });
  const offReconcile = onCampaignReconcile((id) => {
    if (id !== campaignId || !current()) return;
    refresh(campaignId, myGen, false, true);
  });
  stopListening = () => {
    offRing();
    offReconcile();
  };
}

// Boot the subscription once when the campaign changes (shared watcher).
//
// The scope is the whole point. `watch()` called during a component's setup
// belongs to that component and is disposed when it unmounts — but the guard
// below is module-level and never resets, so once the first component to call
// `useCampaignMessages()` went away, the watcher was gone and nothing ever
// recreated it. Chat then stopped syncing for the life of the page.
//
// It showed up as an empty chat after signing in: the first caller mounts while
// `activeCampaignId` is still null, the watcher clears and waits, that component
// unmounts on the redirect into the portal, and the campaign resolves with no
// listener left. Zero requests to `campaign_messages`, no error, no history —
// and a reload "fixed" it because then the id is already set at first call.
//
// `effectScope(true)` detaches it, so the watcher outlives every component
// exactly as its module-level guard already assumed it did.
let watcherStarted = false;
function ensureWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  effectScope(true).run(() => {
  const campaign = useCampaignStore();
  watch(
    () => campaign.activeCampaignId,
    (id) => {
      if (!id) {
        generation++;
        latestFetchId++;
        stopListening?.();
        stopListening = null;
        subscribedCampaignId = null;
        messages.value = [];
        unreadProbe.value = [];
        historyLoadedFor = null;
        deletedMessageIds = new Set();
        loading.value = false;
        loadingOlder.value = false;
        hasOlder.value = false;
        oldestCursor = null;
        return;
      }
      subscribe(id, true);
      refresh(id, generation, true);
    },
    { immediate: true },
  );
  });
}

// ── Public composable ──────────────────────────────────────────────────────────
export function useCampaignMessages() {
  ensureWatcher();

  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const ui = useUiStore();
  // Both lists are read only to resolve a name or a previewed player (#999), so
  // they load only when there is one to resolve: a linked or previewed
  // character for the sender name, preview mode for the whisper filter, or the
  // chat panel being open. Anything else sends under the account's own name and
  // needs neither. A disabled query still serves a list another surface cached.
  const { data: partyMembers } = useParty(
    () => ui.chatOpen || (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId) != null,
  );
  const { data: campaignMembers } = useCampaignMembers(() => ui.chatOpen || ui.dmPreviewMode);

  async function ensureMessage(messageId: string) {
    if (messages.value.some((message) => message.id === messageId)) return;
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("id", messageId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (error) throw error;
    if (data) mergeMessages([data as CampaignMessage]);
  }

  // Name resolution priority: NPC persona → previewed character → linked character → display name
  function getSenderName() {
    if (ui.dmTalkAsNpcName) return ui.dmTalkAsNpcName;
    const memberId = ui.dmPreviewMode
      ? ui.dmPreviewPartyMemberId
      : auth.linkedPartyMemberId;
    if (memberId && partyMembers.value) {
      const character = partyMembers.value.find(m => m.id === memberId);
      if (character?.name) return character.name;
    }
    return auth.publicName ?? "Unknown";
  }

  // In preview mode the DM sees only what the previewed player would see:
  // public messages + whispers addressed to that player's user_id.
  const previewedUserId = computed(() => {
    if (!ui.dmPreviewMode || !ui.dmPreviewPartyMemberId) return null;
    return campaignMembers.value?.find(
      m => m.party_member_id === ui.dmPreviewPartyMemberId,
    )?.user_id ?? null;
  });

  const visibleMessages = computed(() => {
    if (!ui.dmPreviewMode) return messages.value;
    const pid = previewedUserId.value;
    return messages.value.filter(
      m => m.recipient_user_id === null || m.recipient_user_id === pid,
    );
  });

  // What the unread dot reads: the full list once loaded, else the probe plus
  // anything realtime delivered since. Same preview filter as `messages`.
  const unreadMessages = computed<Array<Pick<CampaignMessage, "id" | "campaign_id" | "user_id" | "recipient_user_id" | "type" | "created_at" | "metadata">>>(() => {
    const byId = new Map<string, ProbeMessage | CampaignMessage>();
    for (const m of unreadProbe.value) byId.set(m.id, m);
    for (const m of visibleMessages.value) byId.set(m.id, m);
    const all = [...byId.values()].sort(compareMessages);
    if (!ui.dmPreviewMode) return all;
    const pid = previewedUserId.value;
    return all.filter(m => m.recipient_user_id === null || m.recipient_user_id === pid);
  });

  async function sendFlavorMessage(text: string, skillLabel?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: FlavorMetadata | null = skillLabel ? { skill_label: skillLabel } : null;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: text,
      type: "system",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendMessage(text: string, recipientUserId: string | null = null) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: recipientUserId,
      sender_name: getSenderName(),
      message: text.trim(),
      type: "chat",
      metadata: null,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  /**
   * Narrative system event — used by the DM Prep/Play mode (#133) to announce
   * entity reveals into chat. Posts as a `system` message with no sender name
   * so it renders as a campaign event rather than a person talking.
   * Pass `npcId` to attach an entity link so players can navigate to the NPC.
   */
  async function sendNarrativeEvent(text: string, npcId?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id || !text.trim()) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: null,
      message: text.trim(),
      type: "system",
      metadata: npcId ? { entity_type: "npc", entity_id: npcId } : null,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  /**
   * System event attributed to a named source — the encounter runner, a boss's
   * lair, an NPC mid-cast — rather than to the DM who happens to be driving.
   * Differs from sendFlavorMessage (which speaks as the DM's current persona)
   * only in where the sender name comes from.
   *
   * The array form exists so a burst of runner broadcasts lands in one
   * round-trip instead of N; sendSystemMessage is the single-message form.
   */
  async function sendSystemMessages(texts: string[], senderName: string) {
    const cid = campaign.activeCampaignId;
    const uid = auth.user?.id;
    if (!cid || !uid || !texts.length) return;
    const inserts: CampaignMessageInsert[] = texts.map(text => ({
      campaign_id: cid,
      user_id: uid,
      recipient_user_id: null,
      sender_name: senderName,
      message: text,
      type: "system",
      metadata: null,
    }));
    const { data, error } = await supabase.from("campaign_messages").insert(inserts).select();
    if (error) throw error;
    for (const row of (data ?? [])) _optimisticPush(row as CampaignMessage);
  }

  async function sendSystemMessage(text: string, senderName: string) {
    await sendSystemMessages([text], senderName);
  }

  async function sendRoll(result: RollResult, recipientUserId: string | null = null, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    // Crits are always public — too exciting to hide
    const effectiveRecipient = result.isCrit ? null : recipientUserId;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: effectiveRecipient,
      sender_name: senderName ?? getSenderName(),
      message: `rolled ${result.label} = ${result.total}`,
      type: effectiveRecipient ? "dm_roll" : "roll",
      metadata: result,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  /**
   * `itemId` is a catalogue *reference*, not necessarily a vault uuid — pass
   * `inventoryItemRef(row)` for an inventory row rather than `row.item_id`,
   * or the library half of the reference is dropped on the floor.
   * `itemRefColumns` puts it in whichever column it belongs to, the same way
   * every other write path does.
   */
  async function sendItemDrop(itemName: string, itemId: string | null, quantity: number, rarity: string | null, senderName?: string, imageUrl?: string | null, description?: string | null, isContainer?: boolean) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const metadata: ItemDropMetadata = {
      ...itemRefColumns(itemId), item_name: itemName, item_rarity: rarity, quantity,
      is_container: isContainer ?? false,
      quantity_remaining: quantity,
      claims: [],
      image_url: imageUrl ?? null,
      description: description ?? null,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `dropped ${quantity > 1 ? `${quantity}x ` : ""}${itemName}`,
      type: "item_drop",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendCurrencyDrop(pp: number, gp: number, ep: number, sp: number, cp: number, label?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    // Clamp every coin to a non-negative integer at the source — a negative drop
    // would subtract from the claimer's purse, and fractional coins corrupt wallets.
    const coin = (n: number) => Math.max(0, Math.floor(n || 0));
    pp = coin(pp); gp = coin(gp); ep = coin(ep); sp = coin(sp); cp = coin(cp);
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    if (!parts.length) return;
    const metadata: CurrencyDropMetadata = {
      label: label || null,
      pp, gp, ep, sp, cp,
      claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: label ? `dropped ${label}: ${parts.join(", ")}` : `dropped currency: ${parts.join(", ")}`,
      type: "currency_drop",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function sendVendorOffer(description: string, itemName: string | null, itemId: string | null, pp: number, gp: number, ep: number, sp: number, cp: number, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    const metadata: VendorOfferMetadata = {
      description, item_name: itemName, item_id: itemId,
      pp, gp, ep, sp, cp,
      paid_by_user_id: null, paid_by_name: null, paid_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `offers ${description}${parts.length ? ` for ${parts.join(", ")}` : ""}`,
      type: "vendor_offer",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  // Claims delegate to row-locked SECURITY DEFINER RPCs (claim_vendor_offer /
  // claim_currency_drop / claim_item_drop) which re-check the claimed flag under
  // FOR UPDATE and stamp the claimer from auth.uid() server-side — so concurrent
  // claims serialise and a player cannot overwrite another player's claim. The
  // RPC raises if already claimed; callers treat a throw as "lost the race".
  async function claimVendorOffer(messageId: string, payerName: string, partyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_vendor_offer", {
      p_message_id: messageId,
      p_payer_name: payerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as VendorOfferMetadata };
  }

  async function claimCurrencyDrop(messageId: string, claimerName: string, partyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_currency_drop", {
      p_message_id: messageId,
      p_claimer_name: claimerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as CurrencyDropMetadata };
  }

  async function claimItemDrop(messageId: string, claimerName: string, partyMemberId: string | null, npcId?: string | null) {
    const { data, error } = await supabase.rpc("claim_item_drop", {
      p_message_id: messageId,
      p_claimer_name: claimerName,
      p_party_member_id: partyMemberId,
      p_npc_id: npcId ?? null,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as ItemDropMetadata };
  }

  // ── Stacked item grab (issue #126) ───────────────────────────────────────
  // Delegates to the grab_item_drop RPC which takes a FOR UPDATE row lock so
  // concurrent player clicks serialise without over-claiming.
  // qty = -1 means "grab all remaining".
  // Returns { qty_grabbed, quantity_remaining } on success, throws on failure.
  async function grabItemDrop(messageId: string, qty: number, claimerName: string, partyMemberId: string | null): Promise<{ qty_grabbed: number; quantity_remaining: number }> {
    const { data, error } = await supabase.rpc("grab_item_drop", {
      p_message_id:      messageId,
      p_qty:             qty,
      p_claimer_user_id: auth.user!.id,
      p_claimer_name:    claimerName,
      p_party_member_id: partyMemberId,
    });
    if (error) throw error;
    const result = data as { qty_grabbed: number; quantity_remaining: number };
    // Optimistically patch local message so the UI updates immediately
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0) {
      const existing = messages.value[idx].metadata as ItemDropMetadata;
      const updatedClaims = [
        ...(existing.claims ?? []),
        { user_id: auth.user!.id, name: claimerName, party_member_id: partyMemberId, qty: result.qty_grabbed, at: new Date().toISOString() },
      ];
      messages.value[idx] = {
        ...messages.value[idx],
        metadata: { ...existing, quantity_remaining: result.quantity_remaining, claims: updatedClaims },
      };
    }
    return result;
  }

  // ── Loot chest (issue #121, part B) ──────────────────────────────────────
  // sendLootChest just inserts the message — the table is already rolled
  // client-side and handed in via `metadata`. claimLootChestAtom delegates
  // to a Postgres RPC so concurrent clicks serialise on a row lock.

  async function sendLootChest(metadata: LootChestMetadata, senderName?: string) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName ?? getSenderName(),
      message: `dropped a chest from ${metadata.loot_table_name}`,
      type: "loot_chest",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  async function claimLootChestAtom(messageId: string, atomId: string, claimerName: string) {
    const { data, error } = await supabase.rpc("claim_loot_chest_atom", {
      p_message_id: messageId,
      p_atom_id: atomId,
      p_claimer_name: claimerName,
    });
    if (error) throw error;
    // RPC returns the new metadata blob — patch local state so the chest
    // updates without waiting for the realtime subscription.
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) {
      messages.value[idx] = { ...messages.value[idx], metadata: data as LootChestMetadata };
    }
  }

  async function deleteMessage(id: string) {
    const { error } = await supabase.from("campaign_messages").delete().eq("id", id);
    if (error) throw error;
    deletedMessageIds.add(id);
    messages.value = messages.value.filter(m => m.id !== id);
  }

  async function deleteAllMessages() {
    const cid = campaign.activeCampaignId;
    if (!cid) return;
    const { error } = await supabase.from("campaign_messages").delete().eq("campaign_id", cid);
    if (error) throw error;
    latestFetchId++;
    messages.value = [];
    deletedMessageIds = new Set();
    oldestCursor = null;
    hasOlder.value = false;
    loadingOlder.value = false;
  }

  function _optimisticPush(msg: CampaignMessage) {
    if (messages.value.find(m => m.id === msg.id)) return;
    const uid = auth.user?.id;
    const visible = msg.type === "dm_roll"
      ? auth.isDM || msg.recipient_user_id === uid
      : msg.recipient_user_id === null || auth.isDM || msg.recipient_user_id === uid || msg.user_id === uid;
    if (!visible) return;
    messages.value.push(msg);
    messages.value.sort(compareMessages);
  }

  const myUserId = computed(() => auth.user?.id);

  async function sendPlayerOffer(itemName: string, itemId: string | null, inventoryItemId: string, quantity: number, sellerPartyMemberId: string, pp: number, gp: number, ep: number, sp: number, cp: number) {
    const cid = campaign.activeCampaignId;
    if (!cid || !auth.user?.id) return;
    const parts = formatCoinParts(pp, gp, ep, sp, cp);
    const metadata: PlayerOfferMetadata = {
      item_name: itemName, item_id: itemId, inventory_item_id: inventoryItemId,
      quantity, pp, gp, ep, sp, cp,
      seller_party_member_id: sellerPartyMemberId,
      sold_to_user_id: null, sold_to_name: null, sold_to_party_member_id: null,
    };
    const insert: CampaignMessageInsert = {
      campaign_id: cid,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: getSenderName(),
      message: `offers ${quantity > 1 ? `${quantity}× ` : ""}${itemName} for ${parts.join(", ")}`,
      type: "player_offer",
      metadata,
    };
    const { data, error } = await supabase.from("campaign_messages").insert(insert).select().single();
    if (error) throw error;
    if (data) _optimisticPush(data as CampaignMessage);
  }

  // Delegates to the row-locked SECURITY DEFINER claim_player_offer RPC, which
  // under FOR UPDATE authorizes the caller, validates the offer is unclaimed,
  // checks buyer funds (rejecting if insufficient), debits the buyer, credits the
  // seller (a fellow player's direct UPDATE of the seller's row is blocked by RLS,
  // so this MUST run server-side), and transfers the item — all atomically. The
  // RPC raises on a lost race / insufficient funds / not-authorized; callers treat
  // a throw as "the sale did not happen" and leave wallets/inventory untouched.
  async function claimPlayerOffer(messageId: string, buyerName: string, buyerPartyMemberId: string | null) {
    const { data, error } = await supabase.rpc("claim_player_offer", {
      p_message_id: messageId,
      p_buyer_name: buyerName,
      p_party_member_id: buyerPartyMemberId,
    });
    if (error) throw error;
    const idx = messages.value.findIndex(m => m.id === messageId);
    if (idx >= 0 && data) messages.value[idx] = { ...messages.value[idx], metadata: data as PlayerOfferMetadata };
  }

  return { messages: visibleMessages, unreadMessages, loading, loadingOlder, hasOlder, loadOlder, ensureMessage, sendMessage, sendFlavorMessage, sendNarrativeEvent, sendSystemMessage, sendSystemMessages, sendRoll, sendItemDrop, claimItemDrop, grabItemDrop, sendCurrencyDrop, claimCurrencyDrop, sendLootChest, claimLootChestAtom, sendVendorOffer, claimVendorOffer, sendPlayerOffer, claimPlayerOffer, deleteMessage, deleteAllMessages, myUserId };
}
