// Shell-level UI state: chat panel, DM persona and preview, the DM/Player lens, the live-session mirror.
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

export const useAppUiStore = defineStore("ui:app", () => {
  // Entity list layout (mobile rows/gallery toggle) — persisted across sessions.
  // Shared by the NPC + Monster mobile list screens (<md only).
  const entityListLayout = useStorage<"rows" | "gallery">(
    "grimoire:entity-list-layout",
    "rows",
    safeLocalStorage(),
  );

  // Chat panel
  const chatOpen = ref(false);
  // Lit and cleared by CampaignChat from a per-campaign read position
  // (chatUnread.ts); nothing else should set it.
  const chatHasUnread = ref(false);
  const chatFocusMessageId = ref<string | null>(null);
  const chatFocusRequest = ref(0);

  function toggleChat() {
    chatOpen.value = !chatOpen.value;
    if (chatOpen.value) chatHasUnread.value = false;
  }

  function openChat() {
    chatOpen.value = true;
    chatHasUnread.value = false;
  }

  function openChatAt(messageId: string) {
    chatOpen.value = true;
    chatHasUnread.value = false;
    chatFocusMessageId.value = messageId;
    chatFocusRequest.value += 1;
  }

  // The focus id also drives the highlight ring, so it outlives the scroll on
  // purpose — but only for as long as the panel stays open. Closing ends the
  // jump; without this the ring, and the beat it points at, would follow the
  // DM around for the rest of the session. Several call sites close the panel
  // by assigning `chatOpen` directly, so watch the flag rather than the action.
  watch(chatOpen, (open) => {
    if (!open) chatFocusMessageId.value = null;
  });

  // DM "talk as" NPC — DM can speak/act as any NPC
  const dmTalkAsNpcId   = ref("");
  const dmTalkAsNpcName = ref<string | null>(null);

  function setDmTalkAsNpc(id: string, name: string | null) {
    const cleanName = name || null;
    if (dmTalkAsNpcId.value === id && dmTalkAsNpcName.value === cleanName) return;
    dmTalkAsNpcId.value   = id;
    dmTalkAsNpcName.value = cleanName;
  }

  // DM preview mode — lets DM browse the player portal without a second account
  const dmPreviewMode = ref(false);
  const dmPreviewPartyMemberId = ref<string | null>(null);

  // User-level DM/Player mode (#729) — a persisted *lens*, never a grant.
  // `campaign_members.role` stays the per-campaign truth that RLS and the
  // router's capability checks (dmPreviewMode, ?memberId=) key off; this only
  // decides which home the user lands on and which of their campaigns are in
  // view. Empty string = never chosen → the /welcome first-run modal. For
  // accounts that predate the mode, the router guard infers it once from the
  // loaded membership's role. Switch via useModeSwitch(), never by writing
  // this ref directly — the switch also swaps the per-mode active campaign.
  const userMode = useStorage<"dm" | "player" | "">("grimoire:user-mode", "", safeLocalStorage());

  // Whether the campaign's session is live (#758). A *mirror* of
  // "a session in `campaign_sessions` is open" (#985), owned by `useCampaignSession()` and
  // written by nothing else — the row is the authority, this is the cheap
  // synchronous read the surfaces below already expect.
  //
  // It used to be a persisted ref keyed "grimoire:dm-mode": per browser, no start
  // time, no end. That is where every complaint about the Prep/Play switch came
  // from — a session ended on Thursday was still broadcasting on Sunday, a
  // co-DM could not see it, and a second device stayed in prep. #133 named the
  // fix as a Phase 2 against `campaigns.dm_mode`; the row it became is a better
  // shape, because a session has a span and a preference does not.
  const sessionRunning = ref(false);

  /**
   * Prep or play, derived. Read-only on purpose: the five consumers
   * (NPC reveal broadcast, bottom-bar tab pool, centre FAB, quest landing
   * surface, soundboard Arrange/Perform) keep reading exactly what they read
   * before, while the only way to *change* it is starting or ending a session
   * through `useCampaignSession()`. A writable mode is what let quest creation
   * end a DM's session as a side effect.
   */
  const dmMode = computed<"prep" | "play">(() => (sessionRunning.value ? "play" : "prep"));

  function enterDmPreview(partyMemberId?: string) {
    dmPreviewPartyMemberId.value = partyMemberId ?? null;
    dmPreviewMode.value = true;
  }

  function exitDmPreview() {
    dmPreviewMode.value = false;
    dmPreviewPartyMemberId.value = null;
  }

  return {
    entityListLayout,
    chatOpen,
    chatHasUnread,
    openChat,
    chatFocusMessageId,
    chatFocusRequest,
    toggleChat,
    openChatAt,
    dmTalkAsNpcId,
    dmTalkAsNpcName,
    setDmTalkAsNpc,
    dmPreviewMode,
    dmPreviewPartyMemberId,
    enterDmPreview,
    exitDmPreview,
    userMode,
    dmMode,
    sessionRunning,
  };
});
