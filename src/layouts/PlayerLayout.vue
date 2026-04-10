<template>
  <div class="h-dvh bg-background flex flex-col overflow-hidden">
    <!-- Top bar: branding + character + sign out -->
    <header class="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <span class="font-cinzel text-base font-bold text-gold-500 tracking-widest">Grimoire</span>
        <span class="font-fell text-xs text-muted-foreground italic hidden sm:inline">
          · {{ campaignName }}
        </span>
      </div>

      <div class="flex-1" />

      <span v-if="characterName" class="font-cinzel text-xs text-foreground hidden sm:inline">
        {{ characterName }}
      </span>

      <!-- Live encounter button -->
      <RouterLink
        v-if="anyRunning"
        :to="{ name: 'player-encounter' }"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/15 border border-green-500/40 text-green-400 hover:bg-green-500/25 transition-colors font-cinzel text-xs font-semibold tracking-wider"
      >
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Live
      </RouterLink>

      <button
        class="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Sign out"
        @click="handleSignOut"
      >
        <LogOut class="h-4 w-4" />
      </button>
    </header>

    <!-- DM preview banner -->
    <div
      v-if="ui.dmPreviewMode"
      class="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center gap-3 shrink-0"
    >
      <Eye class="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span class="font-cinzel text-xs text-amber-400 tracking-wider shrink-0">DM Preview — viewing as:</span>
      <select
        :value="ui.dmPreviewPartyMemberId ?? ''"
        class="flex-1 min-w-0 max-w-48 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 font-fell text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        @change="ui.dmPreviewPartyMemberId = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">— pick a character —</option>
        <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button
        class="font-cinzel text-[10px] tracking-wider text-amber-400 hover:text-amber-300 border border-amber-500/40 hover:border-amber-400/60 px-2 py-0.5 rounded transition-colors shrink-0"
        @click="exitPreview"
      >
        Exit Preview
      </button>
    </div>

    <!-- Encounter live toast -->
    <Transition name="toast">
      <div
        v-if="encounterLiveToast"
        class="fixed top-16 right-4 z-50 w-full max-w-sm"
      >
        <RouterLink
          :to="{ name: 'player-encounter' }"
          class="rounded-lg border border-green-500/40 bg-card shadow-xl px-4 py-3 flex items-start gap-3"
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
      </div>
    </Transition>

    <!-- Broadcast toast -->
    <Transition name="toast">
      <div
        v-if="latestMessage"
        class="fixed top-16 right-4 z-50 w-full max-w-sm"
      >
        <div class="rounded-lg border border-primary/30 bg-card shadow-gold-glow px-4 py-3 flex items-start gap-3">
          <Megaphone class="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">DM Announcement</p>
            <p class="font-fell text-sm text-foreground mt-0.5">{{ latestMessage.text }}</p>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors shrink-0" @click="dismiss(latestMessage.id)">
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- Content + chat side panel — pb-16 reserves space above the fixed bottom nav -->
    <div class="flex-1 min-h-0 flex overflow-hidden pb-16">
      <main class="flex-1 overflow-y-auto">
        <div class="px-4 py-6">
          <RouterView />
        </div>
      </main>
      <CampaignChat :contained="true" />
    </div>

    <!-- ── Bottom navigation bar ──────────────────────────────────────────── -->
    <nav class="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border">
      <div class="flex items-stretch justify-around">

        <!-- Mobile (< sm): 4 pinned items -->
        <RouterLink
          v-for="item in mobileNav"
          :key="'mob-' + item.to"
          :to="item.to"
          class="sm:hidden flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
          @click="trackNav(item.to)"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-[9px] tracking-wider">{{ item.label }}</span>
        </RouterLink>

        <!-- Tablet+ (sm+): 7 pinned items -->
        <RouterLink
          v-for="item in tabletNav"
          :key="'tab-' + item.to"
          :to="item.to"
          class="hidden sm:flex flex-col items-center justify-center gap-0.5 flex-1 py-3 transition-colors"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
          @click="trackNav(item.to)"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-[9px] tracking-wider">{{ item.label }}</span>
        </RouterLink>

        <!-- More button (always) -->
        <button
          type="button"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 sm:py-3 transition-colors"
          :class="showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          @click="showMore = true"
        >
          <LayoutGrid class="h-5 w-5 shrink-0" />
          <span class="font-cinzel text-[9px] tracking-wider">More</span>
        </button>

      </div>
    </nav>
  </div>

  <!-- "More" panel -->
  <Teleport to="body">
    <Transition name="more-panel">
      <div
        v-if="showMore"
        class="fixed inset-0 z-50 flex flex-col justify-end"
      >
        <div class="absolute inset-0 bg-black/50" @click="showMore = false" />

        <div class="relative bg-card border-t border-border rounded-t-2xl px-5 pt-4 pb-8 shadow-xl">
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
              @click="trackNav(item.to); showMore = false"
            >
              <component :is="item.icon" class="h-5 w-5 shrink-0" />
              <span class="font-cinzel text-[9px] tracking-wider text-center leading-tight">{{ item.label }}</span>
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
import { LogOut, Megaphone, X, Eye, LayoutGrid, Swords } from "lucide-vue-next";
import { useRunningEncounters, usePlayerEncounterLive } from "@/composables/useEncounterLive";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/useCampaigns";
import { useParty, usePartyLive } from "@/composables/useParty";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useCampaignBroadcast } from "@/composables/useCampaignBroadcast";
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";
import { MOBILE_NAV_SLOTS, TABLET_NAV_SLOTS } from "@/lib/playerNav";
import CampaignChat from "@/components/chat/CampaignChat.vue";

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
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

const { anyRunning, runningLoaded } = useRunningEncounters();
// Keep the player encounter subscription alive for the entire session so state
// stays in sync even when the player navigates away from the encounter page.
usePlayerEncounterLive(campaign.activeCampaignId ?? "");
const encounterLiveToast = ref(false);

// Auto-navigate + toast when a NEW encounter goes live (skip initial data load)
watch([runningLoaded, anyRunning], ([loaded, isRunning], [wasLoaded]) => {
  if (!loaded || !wasLoaded) return; // skip until initial fetch is done
  if (isRunning) {
    encounterLiveToast.value = true;
    setTimeout(() => { encounterLiveToast.value = false; }, 6000);
    if (route.name !== "player-encounter") {
      void router.push({ name: "player-encounter" });
    }
  }
});

const { messages, dismiss } = useCampaignBroadcast();
const latestMessage = computed(() => messages.value[0] ?? null);

const campaignName = computed(() => campaign.activeCampaign?.name ?? "Campaign");
const characterName = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId)?.name ?? null;
});

const { sortedNav, trackNav } = usePlayerNavPrefs();

// Always keep Settings reachable in the quick bar — if it was dragged out of
// the visible slots in custom mode, replace the last slot with it.
function ensureSettings(items: typeof sortedNav.value, slots: number) {
  const slice = items.slice(0, slots);
  const settingsItem = items.find((i) => i.to === "/play/settings");
  if (!settingsItem || slice.some((i) => i.to === "/play/settings")) return slice;
  return [...slice.slice(0, slots - 1), settingsItem];
}

const mobileNav = computed(() => ensureSettings(sortedNav.value, MOBILE_NAV_SLOTS));
const tabletNav = computed(() => ensureSettings(sortedNav.value, TABLET_NAV_SLOTS));

const showMore = ref(false);

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
</style>
