// Shell-level UI state: chat panel, DM persona and preview, the DM/Player lens, the live-session mirror.
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeLocalStorage";

/** A stored lens, or "" (never chosen) for anything the app does not write. */
export function readUserMode(raw: string): "dm" | "player" | "" {
  return raw === "dm" || raw === "player" ? raw : "";
}

/** Who is being played at the AI table, and in which sitting once it has an id. */
export interface TablePlay {
  memberId: string;
  sessionId: string | null;
}

const TABLE_PLAY_KEY = "grimoire:table-play";

// Through the safe storage: where the browser will not hand session storage over, the lens lasts until the next reload.
function readTablePlay(): TablePlay | null {
  try {
    const raw = JSON.parse(safeSessionStorage().getItem(TABLE_PLAY_KEY) ?? "null") as unknown;
    if (typeof raw !== "object" || raw === null) return null;
    const { memberId, sessionId } = raw as Record<string, unknown>;
    if (typeof memberId !== "string" || memberId === "") return null;
    return { memberId, sessionId: typeof sessionId === "string" ? sessionId : null };
  } catch {
    return null;
  }
}

function writeTablePlay(value: TablePlay | null): void {
  try {
    if (value === null) safeSessionStorage().removeItem(TABLE_PLAY_KEY);
    else safeSessionStorage().setItem(TABLE_PLAY_KEY, JSON.stringify(value));
  } catch {
    // Not kept for a reload; nothing else depends on it.
  }
}

export const useAppUiStore = defineStore("ui:app", () => {
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

  // An editor that wants the whole screen (the Cartographer while a map is being
  // built): the shell hides its sidebar and bars while this is set. The editing host
  // sets it on mount and clears it on unmount, so no route can leave the app chrome
  // hidden behind it.
  const editorFocus = ref(false);

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
  //
  // Read through a guard: anything stored that is not a mode reads as "never
  // chosen". The lens fence (#847) acts only on a known mode, so a value the
  // app never writes (a quoted `"dm"` left by hand-edited storage was seen
  // locally) would otherwise switch the fence off while the shell still
  // rendered the DM side. Unknown falls back to the inference above instead.
  const userMode = useStorage<"dm" | "player" | "">("grimoire:user-mode", "", safeLocalStorage(), {
    serializer: { read: readUserMode, write: (mode) => mode },
  });

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

  // Playing at the AI table (#1021). "When you are playing, you are a player: the DM navigation should no longer be
  // visible. You see only what your character has discovered, not the full DM toolkit which lets you see the entire
  // story" (maintainer, 17 Nov 2026). So sitting down puts the shell on the player side AS the played character:
  // the same lens as the DM's preview (every player page then reads through the player-visible rules for that
  // character), with its own name because the reason differs and so does the wording around it.
  //
  // Kept for the tab, in session storage, unlike the preview: a reload in the middle of a sitting must land back in
  // the story, and the router turns a DM away from /play without the lens. It grants nothing: what a page may read
  // is still decided by the database, and this only chooses which side of the app is on screen.
  const tablePlay = ref<TablePlay | null>(readTablePlay());
  if (tablePlay.value !== null) enterDmPreview(tablePlay.value.memberId);

  function enterTablePlay(memberId: string, sessionId: string | null = null) {
    tablePlay.value = { memberId, sessionId };
    writeTablePlay(tablePlay.value);
    enterDmPreview(memberId);
  }

  /** The sitting now has an id (its first turn created it), so "back to the story" can find it. */
  function setTablePlaySession(sessionId: string) {
    if (tablePlay.value === null || tablePlay.value.sessionId === sessionId) return;
    tablePlay.value = { ...tablePlay.value, sessionId };
    writeTablePlay(tablePlay.value);
  }

  function exitTablePlay() {
    if (tablePlay.value === null) return;
    tablePlay.value = null;
    writeTablePlay(null);
    exitDmPreview();
  }

  return {
    editorFocus,
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
    tablePlay,
    enterTablePlay,
    setTablePlaySession,
    exitTablePlay,
    enterDmPreview,
    exitDmPreview,
    userMode,
    dmMode,
    sessionRunning,
  };
});
