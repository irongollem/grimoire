<template>
  <div class="h-dvh bg-background flex flex-col overflow-hidden" :style="chromeStyle">
    <!-- Top bar: branding + character + sign out. A full-screen phone route
         (meta.fullscreenMobile, e.g. a handout in the reader) brings its own
         header and back button, as it does under DefaultLayout. -->
    <header v-if="!fullscreenMobile" class="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
      <!-- Phones name the page here (as the DM top bar does), so a player always
           sees where they are; the brand mark stays on Adventurer's Rest and
           from md up, where each page draws its own heading. -->
      <h1
        v-if="phoneTitle"
        class="md:hidden min-w-0 flex-1 truncate text-heading font-semibold text-gold-500"
      >
        {{ phoneTitle }}
      </h1>
      <div class="flex items-center gap-2 shrink-0" :class="phoneTitle ? 'hidden md:flex' : ''">
        <BrandLogo class="h-7 w-auto" />
        <span class="text-caption text-muted-foreground italic hidden sm:inline">
          · {{ campaignName }}
        </span>
      </div>

      <div class="flex-1" :class="phoneTitle ? 'hidden md:block' : ''" />

      <!-- In-game today date -->
      <span class="hidden md:inline-flex items-center gap-1 text-body text-muted-foreground italic shrink-0">
        <IconCalendarDays class="h-3 w-3 text-primary shrink-0" />
        {{ todayLabel }}
      </span>

      <span v-if="characterName && route.name !== 'play' && route.name !== 'play-character'" class="text-caption text-foreground hidden sm:inline">
        {{ characterName }}
      </span>

      <!--
        The table is sitting. Deliberately quiet and not a control: a player can
        do nothing with this except know it, and it answers the question a
        single chat message cannot for someone who joined late or reopened the
        app — "is the DM running the game right now, or prepping?"

        Yields to the live-encounter pill: combat is the more urgent thing, and
        two green lights in one corner is the mistake the DM side already made.
      -->
      <span
        v-if="sessionLive && !anyRunning"
        class="hidden items-center gap-1.5 text-caption text-primary sm:inline-flex shrink-0"
        :title="sessionSince"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" :class="{ 'animate-pulse': !reducedMotion }" />
        {{ sessionChip }}
      </span>

      <!-- Live encounter — mobile: navigate to encounter view -->
      <AppButton
        v-if="anyRunning"
        :to="{ name: 'player-encounter' }"
        variant="tinted"
        tone="success"
        emphasis="soft"
        size="sm"
        class="md:hidden relative"
      >
        <span
          v-if="needsRoll"
          class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive"
          aria-label="Roll your initiative"
        />
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-tone-success opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-tone-success" />
        </span>
        Live
      </AppButton>

      <!-- Live encounter — tablet+: toggle the encounter sidebar -->
      <AppButton
        v-if="anyRunning"
        variant="tinted"
        tone="success"
        :emphasis="showEncounterPanel ? 'strong' : 'soft'"
        size="sm"
        class="hidden md:flex"
        @click="showEncounterPanel = !showEncounterPanel"
      >
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-tone-success opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-tone-success" />
        </span>
        Live
      </AppButton>

      <DiceRoller />

      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Open chat"
        class="relative"
        @click="ui.toggleChat()"
      >
        <template #icon>
          <IconMessage class="h-4 w-4" />
          <span v-if="ui.chatHasUnread" class="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
        </template>
      </AppButton>

      <!-- Hamburger menu -->
      <div class="relative">
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Menu"
          data-tour="account-menu"
          :icon="IconMenu"
          icon-size="md"
          @click="showMenu = !showMenu"
        />
      </div>
    </header>

    <!-- DM preview banner -->
    <div
      v-if="ui.dmPreviewMode"
      class="bg-tone-caution px-4 py-2 flex items-center gap-3 shrink-0"
    >
      <IconReveal class="h-3.5 w-3.5 text-on-caution/70 shrink-0" />
      <span class="text-label-lg text-on-caution font-semibold shrink-0">Previewing as:</span>
      <select
        :value="ui.dmPreviewPartyMemberId ?? ''"
        class="flex-1 min-w-0 max-w-48 bg-on-caution/10 border border-on-caution/20 rounded px-2 py-0.5 text-caption text-on-caution focus:outline-none focus:ring-1 focus:ring-on-caution/30"
        @change="ui.dmPreviewPartyMemberId = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">Pick a character</option>
        <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button
        class="text-label md:text-xs text-on-caution font-semibold border border-on-caution/30 hover:bg-on-caution/10 px-2 py-0.5 rounded transition-colors shrink-0"
        @click="exitPreview"
      >
        Exit Preview
      </button>
    </div>

    <!-- Encounter live toast -->
    <Transition name="toast">
      <div
        v-if="encounterLiveToast"
        class="fixed top-16 right-4 z-50 w-full max-w-sm pr-safe"
      >
        <!-- Mobile: tap navigates to encounter view -->
        <RouterLink
          :to="{ name: 'player-encounter' }"
          class="md:hidden rounded-lg border border-tone-success/40 bg-card shadow-xl px-4 py-3 flex items-start gap-3"
          @click="encounterLiveToast = false"
        >
          <IconEncounter class="h-4 w-4 text-ink-success shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-label-lg font-semibold text-ink-success">
              {{ needsRoll ? "Roll your initiative" : "Encounter Started!" }}
            </p>
            <p class="text-body text-foreground mt-0.5">
              {{ needsRoll ? "Your DM has started a live encounter. Tap to roll." : "Your DM has started a live encounter. Tap to join." }}
            </p>
          </div>
          <AppButton
            variant="ghost"
            size="inline"
            :icon="IconClose"
            ariaLabel="Dismiss"
            class="shrink-0"
            @click.prevent="encounterLiveToast = false"
          />
        </RouterLink>
        <!-- Tablet+: tap dismisses (panel already opened automatically) -->
        <div
          class="hidden md:flex rounded-lg border border-tone-success/40 bg-card shadow-xl px-4 py-3 items-start gap-3"
        >
          <IconEncounter class="h-4 w-4 text-ink-success shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-label-lg font-semibold text-ink-success">Encounter Started!</p>
            <p class="text-body text-foreground mt-0.5">Live encounter panel opened on the left.</p>
          </div>
          <AppButton
            variant="ghost"
            size="inline"
            :icon="IconClose"
            ariaLabel="Dismiss"
            class="shrink-0"
            @click="encounterLiveToast = false"
          />
        </div>
      </div>
    </Transition>

    <!-- Content + sidebars — reserve space above the fixed bottom nav,
         extending into the home-indicator safe area so the nav and gesture bar
         don't both land on top of the last row of content on notched phones. -->
    <div
      class="flex-1 min-h-0 flex overflow-hidden"
      :class="fullscreenMobile ? '' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]'"
    >
      <!-- Encounter sidebar (md+, left) -->
      <Transition name="encounter-panel">
        <aside
          v-if="showEncounterPanel && !isMobile"
          class="flex flex-col shrink-0 bg-card h-full min-h-0"
          :style="{ width: encounterPanelWidth + 'px', containerType: 'inline-size' }"
        >
          <PlayerEncounterPanel @close="showEncounterPanel = false" />
        </aside>
      </Transition>

      <!-- Drag handle — visible whenever the encounter panel is open -->
      <div
        v-if="showEncounterPanel && !isMobile"
        class="encounter-resize-handle"
        title="Drag to resize"
        @mousedown.prevent="startEncounterResize($event)"
        @touchstart.prevent="startEncounterResizeTouch($event)"
      />

      <main ref="mainEl" class="flex-1 overflow-y-auto">
        <!-- Same as App.vue: the outgoing page stays mounted, only hidden,
             while a slow route chunk downloads, so a cancelled navigation
             finds its scroll and form state intact. Outside the padded
             wrapper because RouteSkeleton brings its own page padding. -->
        <RouteSkeleton v-if="navigationPending" />
        <div
          v-show="!navigationPending"
          :class="fullscreenMobile || route.meta.fillsMain ? 'h-full' : 'px-4 py-6'"
        >
          <!-- Renders nothing unless the DM is actually sharing audio, so a
               table that plays in one room never sees it. -->
          <PlayerAudioStream class="mb-4" />
          <RouterView />
        </div>
      </main>
      <CampaignChat :contained="true" :hide-tab="true" />
    </div>

    <PlayerBottomNav v-if="!fullscreenMobile" :show-more="showMore" :unread-paths="unreadPaths" @open-more="showMore = true" />
  </div>

  <BugReportModal v-if="bugReportMounted" v-model="bugReportOpen" />

  <!-- Location quick-view opened from @location chips in rich text -->
  <PlayerLocationDialog v-if="locationDialogMounted" />

  <!-- EU AI Act Art 50(1) likeness consent gate — opened by useLikenessGate
       before any portrait-bearing generation (Simulacrum, chronicle scene
       references, group portrait, NPC disguise) -->
  <LikenessNoticeGate />

  <!-- Blocking re-consent gate for an account whose terms_version predates
       the current one (#919) — also the only path by which a pre-existing
       account discovers it needs to become parent-managed. -->
  <TermsGate />

  <!-- The death notice (#982): once per person, never over a live encounter. -->
  <MemorialTolling :suppressed="anyRunning" />

  <!-- Hamburger dropdown -->
  <Teleport to="body">
    <div v-if="showMenu" class="fixed inset-0 z-50" @click="showMenu = false">
      <div
        data-slip class="absolute right-2 top-14 bg-card border border-border rounded-lg shadow-xl overflow-hidden w-44"
        @click.stop
      >
        <ModeToggle class="px-4 py-3" />
        <AppButton
          :to="{ name: 'play-settings' }"
          variant="menu"
          size="sm"
          block
          label="Settings"
          :icon="IconSettingsAlt"
          icon-size="md"
          @click="showMenu = false"
        />
        <AppButton
          v-if="showDiscord"
          :href="discordUrl"
          target="_blank"
          rel="noopener"
          variant="menu"
          size="sm"
          block
          label="Join our Discord"
          @click="showMenu = false"
        >
          <template #icon><BrandIcon name="discord" class="h-4 w-4" /></template>
        </AppButton>
        <AppButton
          variant="menu"
          size="sm"
          block
          label="Report a bug"
          :icon="IconBug"
          icon-size="md"
          @click="showMenu = false; bugReportOpen = true"
        />
        <AppButton
          variant="menu"
          tone="danger"
          size="sm"
          block
          label="Sign Out"
          :icon="IconLogOut"
          icon-size="md"
          @click="showMenu = false; handleSignOut()"
        />
      </div>
    </div>
  </Teleport>

  <PlayerCampaignsSheet v-if="campaignSheetMounted" v-model:open="showCampaignSheet" />

  <!-- "More" panel -->
  <Teleport to="body">
    <Transition name="more-panel">
      <div
        v-if="showMore"
        class="fixed inset-0 z-50 flex flex-col justify-end"
      >
        <div class="absolute inset-0 bg-black/50" @click="showMore = false" />

        <PlayerNavGrid
          :unread-paths="unreadPaths"
          :campaign-name="campaignName"
          :character-name="characterName"
          @close="showMore = false"
          @open-campaigns="showMore = false; showCampaignSheet = true"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import MemorialTolling from "@/components/memorials/MemorialTolling.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
import { ref, computed, watch, defineAsyncComponent, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import { IconBug, IconCalendarDays, IconClose, IconEncounter, IconLogOut, IconMenu, IconMessage, IconReveal, IconSettingsAlt } from '@/lib/icons';
import { useCalendarStore } from "@/stores/calendar";
import AppButton from "@/components/common/AppButton.vue";
import RouteSkeleton from "@/components/common/RouteSkeleton.vue";
import { navigationPending } from "@/router/navigationPending";
import DiceRoller from "@/components/common/DiceRoller.vue";
import { useNeedsInitiativeRoll } from "@/composables/encounters/useNeedsInitiativeRoll";
import { usePlayerEncounterLive } from "@/composables/encounters/useEncounterLive";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { usePlayerSessionState, formatSessionElapsed } from "@/composables/campaign/useCampaignSession";
import { prefersReducedMotion } from "@/lib/motion";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/campaign/useCampaigns";
import { useParty, usePartyLive } from "@/composables/party/useParty";
import { useCampaignLiveSync } from "@/composables/campaign/useCampaignLiveSync";
import { usePlayerRemovalGuard } from "@/composables/play/usePlayerRemovalGuard";
import { useCampaignPresence } from "@/composables/campaign/useCampaignPresence";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import PlayerEncounterPanel from "@/components/player/PlayerEncounterPanel.vue";
import PlayerBottomNav from "@/components/layout/PlayerBottomNav.vue";
import PlayerNavGrid from "@/components/layout/PlayerNavGrid.vue";
import { usePlayerUnread } from "@/composables/play/usePlayerUnread";
import ModeToggle from "@/components/layout/ModeToggle.vue";
import BrandIcon from "@/components/brand/BrandIcon.vue";
import { useDiscordInvite } from "@/composables/account/useDiscordInvite";
import { useLazyMount } from "@/composables/useLazyMount";
import LikenessNoticeGate from "@/components/campaign/LikenessNoticeGate.vue";
import TermsGate from "@/components/account/TermsGate.vue";
import PlayerAudioStream from "@/components/soundboard/PlayerAudioStream.vue";
import { activeThemeId } from "@/lib/themeRuntime";
import { darkChromeStyle } from "@/lib/memorials/hallGround";

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
// Players are where child accounts live, so this menu is the one the
// child-account gate in useDiscordInvite matters most for.
const { url: discordUrl, visible: showDiscord } = useDiscordInvite();
// Deferred — a dialog most sessions never open should not be entry-chunk
// weight. Latched rather than mirrored so a half-typed report survives a
// close/reopen, exactly as the always-mounted version did.
const BugReportModal = defineAsyncComponent(
  () => import("@/components/common/BugReportModal.vue"),
);

// #999: both mount only on first open. Each owns a query (the shared-locations
// RPC, the player's campaign list) that cost a request on every cold load of the
// portal for a panel most sessions never show.
const PlayerLocationDialog = defineAsyncComponent(
  () => import("@/components/play/PlayerLocationDialog.vue"),
);
const PlayerCampaignsSheet = defineAsyncComponent(
  () => import("@/components/layout/PlayerCampaignsSheet.vue"),
);

const bugReportOpen = ref(false);
const bugReportMounted = useLazyMount(bugReportOpen);
const route = useRoute();
// A page that is always dark (meta.darkChrome, the Hall of the Fallen) takes the bars with it,
// on a stone ground so a rubber-band scroll past the page shows wall, not vellum's paper.
const chromeStyle = computed(() => (route.meta.darkChrome ? darkChromeStyle(activeThemeId.value) : undefined));

const membershipCampaignId = computed(() => auth.membership?.campaign_id ?? null);
watch(membershipCampaignId, (id) => {
  if (id && !campaign.activeCampaignId) campaign.activeCampaignId = id;
}, { immediate: true });

const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
watch(campaignData, (c) => {
  if (c && (!campaign.activeCampaign || campaign.activeCampaign.theme !== c.theme)) {
    campaign.switchToCampaign(c);
  }
}, { immediate: true });

const router = useRouter();
const { data: partyMembers } = useParty();

watch(
  [() => ui.dmPreviewMode, partyMembers],
  ([previewMode, members]) => {
    if (previewMode && !ui.dmPreviewPartyMemberId && members?.length) {
      ui.dmPreviewPartyMemberId = members[0].id;
    }
  },
  { immediate: true },
);

useCampaignPresence();
usePartyLive();
useCampaignLiveSync();
usePlayerRemovalGuard();

const isMobile = useIsMobile();
// Same rule as DefaultLayout: below md only, a route that is a full-screen
// takeover drops the layout's own top bar, bottom nav and content padding.
const fullscreenMobile = computed(() => isMobile.value && !!route.meta.fullscreenMobile);
// Keep the player encounter subscription alive for the entire session so state
// stays in sync even when the player navigates away from the encounter page.
const { liveState: playerLiveState, liveStateLoaded: runningLoaded } =
  usePlayerEncounterLive(() => campaign.activeCampaignId);

const { data: playerSession } = usePlayerSessionState(() => campaign.activeCampaignId);
const reducedMotion = prefersReducedMotion();
const sessionLive = computed(() => playerSession.value?.isRunning === true);
const sessionSince = computed(() => {
  const elapsed = formatSessionElapsed(playerSession.value?.startedAt ?? null);
  return elapsed ? `Running for ${elapsed}` : "The table is sitting";
});
const sessionChip = computed(() =>
  playerSession.value && playerSession.value.number !== null
    ? `${sessionShortLabel({ number: playerSession.value.number })} live`
    : "Session live",
);
const anyRunning = computed(() => playerLiveState.value?.is_running === true);
const needsRoll = useNeedsInitiativeRoll(
  () => playerLiveState.value?.combatants_live,
  () => auth.linkedPartyMemberId,
);
const encounterLiveToast = ref(false);
const showEncounterPanel = ref(false);
const encounterPanelWidth = ref(288); // w-72 default

function startEncounterResize(e: MouseEvent) {
  const startX = e.clientX;
  const startWidth = encounterPanelWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  function onMove(ev: MouseEvent) {
    encounterPanelWidth.value = Math.max(180, Math.min(520, startWidth + (ev.clientX - startX)));
  }
  function onUp() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function startEncounterResizeTouch(e: TouchEvent) {
  const startX = e.touches[0].clientX;
  const startWidth = encounterPanelWidth.value;
  document.body.style.userSelect = "none";
  function onMove(ev: TouchEvent) {
    encounterPanelWidth.value = Math.max(180, Math.min(520, startWidth + (ev.touches[0].clientX - startX)));
  }
  function onEnd() {
    document.body.style.userSelect = "";
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
  }
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);
}

// Auto-open the encounter panel when an encounter goes live.
// On the initial page load (oldVals undefined/falsy) just open the panel silently.
// Mid-session transitions also show the toast so the player is notified.
watch([runningLoaded, anyRunning], ([loaded, isRunning], oldVals) => {
  if (!loaded || !isRunning) return;
  showEncounterPanel.value = true;
  if (oldVals?.[0]) {
    encounterLiveToast.value = true;
    setTimeout(() => { encounterLiveToast.value = false; }, 6000);
  }
}, { immediate: true });

// Adventurer's Rest keeps the wordmark: it is the front door, not a page in a campaign.
const phoneTitle = computed(() => {
  const title = route.meta.title;
  return typeof title === "string" && route.name !== "play-home" ? title : null;
});
const campaignName = computed(() => campaign.activeCampaign?.name ?? "Campaign");

const calendarStore = useCalendarStore();
const todayLabel = computed(() => {
  const m = calendarStore.adapter.months.find((mo) => mo.num === campaign.todayMonth);
  const monthName = m?.name ?? m?.alias ?? `Month ${campaign.todayMonth}`;
  return `${monthName} ${campaign.todayDay}, ${campaign.todayYear}`;
});
const characterName = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId)?.name ?? null;
});

const showMore = ref(false);
const showMenu = ref(false);
const showCampaignSheet = ref(false);
const campaignSheetMounted = useLazyMount(showCampaignSheet);
const locationDialogOpen = computed(() => ui.playerLocationDialogId !== null);
const locationDialogMounted = useLazyMount(locationDialogOpen);
const { unreadPaths } = usePlayerUnread();
watch(() => route.path, () => { showMore.value = false; });

// A new page starts at its top, as in DefaultLayout: `<main>` is what scrolls
// here, not `window`, so the router's `scrollBehavior` never reached it and a
// player opening their sheet from the Adventurer's Rest landed partway down it.
const mainEl = useTemplateRef<HTMLElement>("mainEl");
watch(
  () => route.matched[0],
  (record, previous) => {
    if (record !== previous && mainEl.value) mainEl.value.scrollTop = 0;
  },
);

function exitPreview() {
  ui.exitDmPreview();
  router.push({ name: "dashboard" });
}

async function handleSignOut() {
  await auth.signOut();
  router.push({ name: "login" });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(-0.5rem);
  opacity: 0;
}

.more-panel-enter-active {
  transition: opacity 0.2s ease;
}
.more-panel-leave-active {
  transition: opacity 0.2s ease;
}
.more-panel-enter-from,
.more-panel-leave-to {
  opacity: 0;
}
.more-panel-enter-active .relative,
.more-panel-leave-active .relative {
  transition: transform 0.25s ease;
}
.more-panel-enter-from .relative,
.more-panel-leave-to .relative {
  transform: translateY(100%);
}

.encounter-panel-enter-active,
.encounter-panel-leave-active {
  transition: width 0.25s ease, opacity 0.2s ease;
  overflow: hidden;
}
.encounter-panel-enter-from,
.encounter-panel-leave-to {
  width: 0 !important;
  opacity: 0;
}

.encounter-resize-handle {
  width: 0.375rem;
  flex-shrink: 0;
  cursor: col-resize;
  background: theme(colors.border / 100%);
  transition: background 0.15s;
  position: relative;
  z-index: 1;
}
/* Expand touch/click surface to ~44px without affecting layout */
.encounter-resize-handle::before {
  content: '';
  position: absolute;
  inset: 0;
  margin-inline: -1.1875rem;
}
.encounter-resize-handle::after {
  content: '';
  position: absolute;
  top: calc(50% - 1.25rem);
  left: 0.0625rem;
  width: 0.25rem;
  height: 2.5rem;
  border-left: 1.5px dotted theme(colors.muted-foreground / 50%);
  border-right: 1.5px dotted theme(colors.muted-foreground / 50%);
}
.encounter-resize-handle:hover {
  background: theme(colors.primary / 30%);
}
.encounter-resize-handle:hover::after {
  border-color: theme(colors.primary / 70%);
}
</style>
