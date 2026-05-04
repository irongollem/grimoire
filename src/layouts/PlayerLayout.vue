<template>
  <div class="h-dvh bg-background flex flex-col overflow-hidden">
    <!-- Top bar: branding + character + sign out -->
    <header class="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <span class="font-cinzel text-base font-bold text-gold-500 tracking-widest">Grimoire</span>
        <span class="font-fell text-xs md:text-sm text-muted-foreground italic hidden sm:inline">
          · {{ campaignName }}
        </span>
      </div>

      <div class="flex-1" />

      <!-- In-game today date -->
      <span class="hidden md:inline-flex items-center gap-1 font-fell text-sm text-muted-foreground italic shrink-0">
        <CalendarDays class="h-3 w-3 text-primary shrink-0" />
        {{ todayLabel }}
      </span>

      <span v-if="characterName && route.path !== '/play'" class="font-cinzel text-xs text-foreground hidden sm:inline">
        {{ characterName }}
      </span>

      <!-- Live encounter — mobile: navigate to encounter view -->
      <RouterLink
        v-if="anyRunning"
        :to="{ name: 'player-encounter' }"
        class="md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/15 border border-green-500/40 text-green-400 hover:bg-green-500/25 transition-colors font-cinzel text-xs font-semibold tracking-wider"
      >
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Live
      </RouterLink>

      <!-- Live encounter — tablet+: toggle the encounter sidebar -->
      <button
        v-if="anyRunning"
        type="button"
        class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors font-cinzel text-xs font-semibold tracking-wider"
        :class="showEncounterPanel
          ? 'bg-green-500/25 border-green-400/60 text-green-300'
          : 'bg-green-500/15 border-green-500/40 text-green-400 hover:bg-green-500/25'"
        @click="showEncounterPanel = !showEncounterPanel"
      >
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Live
      </button>

      <DiceRoller />

      <button
        class="relative p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Open chat"
        @click="ui.toggleChat()"
      >
        <MessageCircle class="h-4 w-4" />
        <span v-if="ui.chatHasUnread" class="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
      </button>

      <!-- Hamburger menu -->
      <div class="relative">
        <button
          class="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Menu"
          @click="showMenu = !showMenu"
        >
          <Menu class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- DM preview banner -->
    <div
      v-if="ui.dmPreviewMode"
      class="bg-amber-500 px-4 py-2 flex items-center gap-3 shrink-0"
    >
      <Eye class="h-3.5 w-3.5 text-black/70 shrink-0" />
      <span class="font-cinzel text-xs text-black font-semibold tracking-wider shrink-0">DM Preview — viewing as:</span>
      <select
        :value="ui.dmPreviewPartyMemberId ?? ''"
        class="flex-1 min-w-0 max-w-48 bg-black/10 border border-black/20 rounded px-2 py-0.5 font-fell text-xs text-black focus:outline-none focus:ring-1 focus:ring-black/30"
        @change="ui.dmPreviewPartyMemberId = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">— pick a character —</option>
        <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button
        class="font-cinzel text-2xs md:text-xs tracking-wider text-black font-semibold border border-black/30 hover:bg-black/10 px-2 py-0.5 rounded transition-colors shrink-0"
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
          class="md:hidden rounded-lg border border-green-500/40 bg-card shadow-xl px-4 py-3 flex items-start gap-3"
          @click="encounterLiveToast = false"
        >
          <Swords class="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-green-400 tracking-wider">Encounter Started!</p>
            <p class="font-fell text-sm text-foreground mt-0.5">Your DM has started a live encounter. Tap to join.</p>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors shrink-0" @click.prevent="encounterLiveToast = false">
            <X class="h-3.5 w-3.5" />
          </button>
        </RouterLink>
        <!-- Tablet+: tap dismisses (panel already opened automatically) -->
        <div
          class="hidden md:flex rounded-lg border border-green-500/40 bg-card shadow-xl px-4 py-3 items-start gap-3"
        >
          <Swords class="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-green-400 tracking-wider">Encounter Started!</p>
            <p class="font-fell text-sm text-foreground mt-0.5">Live encounter panel opened on the left.</p>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors shrink-0" @click="encounterLiveToast = false">
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Transition>


    <!-- Content + sidebars — reserve space above the fixed bottom nav,
         extending into the home-indicator safe area so the nav and gesture bar
         don't both land on top of the last row of content on notched phones. -->
    <div class="flex-1 min-h-0 flex overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]">
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

      <main class="flex-1 overflow-y-auto">
        <div class="px-4 py-6">
          <RouterView />
        </div>
      </main>
      <CampaignChat :contained="true" :hide-tab="true" />
    </div>

    <!-- ── Bottom navigation bar ──────────────────────────────────────────── -->
    <!-- pb-safe pushes the nav's inner content above the iOS home indicator;
         pl-safe / pr-safe keep the edge buttons off landscape notches. -->
    <nav class="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border h-[calc(4rem+env(safe-area-inset-bottom))] pb-safe pl-safe pr-safe">
      <div class="flex items-stretch justify-around">

        <!-- Mobile (< sm): 4 pinned items -->
        <RouterLink
          v-for="item in mobileNav"
          :key="'mob-' + item.to"
          :to="item.to"
          class="sm:hidden flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-2xs md:text-xs tracking-wider">{{ item.label }}</span>
        </RouterLink>

        <!-- Tablet+ (sm+): 7 pinned items -->
        <RouterLink
          v-for="item in tabletNav"
          :key="'tab-' + item.to"
          :to="item.to"
          class="hidden sm:flex flex-col items-center justify-center gap-0.5 flex-1 py-3 transition-colors"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-2xs md:text-xs tracking-wider">{{ item.label }}</span>
        </RouterLink>

        <!-- More button (always) -->
        <button
          type="button"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 sm:py-3 transition-colors"
          :class="showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          @click="showMore = true"
        >
          <LayoutGrid class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-2xs md:text-xs tracking-wider">More</span>
        </button>

      </div>
    </nav>
  </div>

  <BugReportModal v-model="bugReportOpen" />

  <!-- Hamburger dropdown -->
  <Teleport to="body">
    <div v-if="showMenu" class="fixed inset-0 z-50" @click="showMenu = false">
      <div
        class="absolute right-2 top-14 bg-card border border-border rounded-lg shadow-xl overflow-hidden w-44"
        @click.stop
      >
        <RouterLink
          :to="{ name: 'play-settings' }"
          class="flex items-center gap-2.5 px-4 py-3 font-cinzel text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          @click="showMenu = false"
        >
          <Settings class="h-4 w-4" />
          Settings
        </RouterLink>
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-4 py-3 font-cinzel text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          @click="showMenu = false; bugReportOpen = true"
        >
          <Bug class="h-4 w-4" />
          Report a Bug
        </button>
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-4 py-3 font-cinzel text-xs font-semibold text-destructive hover:bg-muted transition-colors"
          @click="showMenu = false; handleSignOut()"
        >
          <LogOut class="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  </Teleport>

  <!-- "More" panel -->
  <Teleport to="body">
    <Transition name="more-panel">
      <div
        v-if="showMore"
        class="fixed inset-0 z-50 flex flex-col justify-end"
      >
        <div class="absolute inset-0 bg-black/50" @click="showMore = false" />

        <div class="relative bg-card border-t border-border rounded-t-2xl px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
          <div class="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-5" />

          <div class="grid grid-cols-4 sm:grid-cols-7 gap-1">
            <RouterLink
              v-for="item in sortedNav"
              :key="item.to"
              :to="item.to"
              class="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 transition-colors"
              :class="isActive(item.to)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
              @click="showMore = false"
            >
              <component :is="item.icon" class="h-5 w-5 shrink-0" />
              <span class="font-cinzel text-2xs md:text-xs tracking-wider text-center leading-tight">{{ item.label }}</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import { LogOut, X, Eye, LayoutGrid, Swords, Bug, MessageCircle, Menu, Settings, CalendarDays } from "lucide-vue-next";
import { useCalendarStore } from "@/stores/calendar";
import DiceRoller from "@/components/common/DiceRoller.vue";
import { useRunningEncounters, usePlayerEncounterLive } from "@/composables/useEncounterLive";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/useCampaigns";
import { useParty, usePartyLive } from "@/composables/useParty";
import { useCampaignLiveSync } from "@/composables/useCampaignLiveSync";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { MOBILE_NAV_SLOTS, TABLET_NAV_SLOTS } from "@/lib/playerNav";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import PlayerEncounterPanel from "@/components/player/PlayerEncounterPanel.vue";
import BugReportModal from "@/components/common/BugReportModal.vue";

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
const bugReportOpen = ref(false);
const route = useRoute();

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

const isMobile = useIsMobile();
const { anyRunning, runningLoaded } = useRunningEncounters();
// Keep the player encounter subscription alive for the entire session so state
// stays in sync even when the player navigates away from the encounter page.
usePlayerEncounterLive(campaign.activeCampaignId ?? "");
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

const { sortedNav } = usePlayerNavPrefs();

const mobileNav = computed(() => sortedNav.value.slice(0, MOBILE_NAV_SLOTS));
const tabletNav = computed(() => sortedNav.value.slice(0, TABLET_NAV_SLOTS));

const showMore = ref(false);
const showMenu = ref(false);

function isActive(to: string): boolean {
  return to === "/play" ? route.path === "/play" : route.path.startsWith(to);
}

watch(() => route.path, () => { showMore.value = false; });

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
  transform: translateY(-8px);
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
  width: 6px;
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
  margin-inline: -19px;
}
.encounter-resize-handle::after {
  content: '';
  position: absolute;
  top: calc(50% - 20px);
  left: 1px;
  width: 4px;
  height: 40px;
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
