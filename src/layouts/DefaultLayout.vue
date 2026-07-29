<template>
  <!-- h-dvh (dynamic viewport height) tracks mobile browser chrome as it
       shows/hides, preventing the bottom of the layout from being hidden
       below Safari's URL bar. h-screen would overflow on mobile Safari. -->
  <div class="flex h-dvh overflow-hidden bg-background">
    <AppSidebar />

    <div class="flex-1 flex flex-col min-w-0">
      <!-- Account-frozen notice (chargeback/fraud or admin freeze) -->
      <SuspensionBanner />

      <!-- Suppressed on mobile full-screen takeover routes (NPC detail/edit),
           which render their own top app bar — avoids two stacked top bars. -->
      <AppTopBar v-if="!fullscreenMobile" />

      <!-- Bottom padding reserves room for the docked DM bottom nav so
           page/list bottoms aren't hidden behind it; reset whenever the
           sidebar (not the bottom bar) is the nav chrome, and dropped
           entirely on full-screen takeover routes (which own their full
           viewport). The bar/sidebar boundary is pointer-driven, not just
           width-driven — see the `barnav:`/`sidenav:` custom variants in
           src/assets/main.css. -->
      <main
        class="flex flex-1 min-h-0 flex-col overflow-y-auto sidenav:pb-0"
        :class="fullscreenMobile ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'"
      >
        <slot />
      </main>
    </div>

    <!-- Docked, mode-aware DM bottom navigation — shown whenever the bar (not
         the sidebar) is the nav chrome: touch-first devices and narrow
         windows alike, see the `barnav:`/`sidenav:` custom variants in
         src/assets/main.css. Hidden on full-screen takeover routes so it
         doesn't collide with the screen's own bottom action bar. -->
    <DmBottomNav v-if="!fullscreenMobile" />

    <CampaignChat />

    <!--
      Generator panels are always mounted here so that background generation
      (started when the panel is open then dismissed) survives navigation.
      Each panel renders nothing visually when its open flag is false.
      To add a new generator: mount its panel here, register it in its
      useXxxGeneration.ts via registerAiGenerator(), and that's it.
    -->
    <NpcGeneratorPanel />
    <MonsterGeneratorPanel />
    <ItemGeneratorPanel />
    <PuzzleGeneratorPanel />
    <SpellGeneratorPanel />
    <QuestGeneratorPanel />
    <TrapGeneratorPanel />
    <FactionGeneratorPanel />
    <LocationGeneratorPanel />
    <RollTableGeneratorPanel />

    <!-- Shows a pill for every active/completed/errored AI generation -->
    <AiGenerationBadge />

    <!-- Soundboard floating widget — always mounted so audio survives navigation -->
    <SoundboardWidget />

    <!-- App-wide shortcuts: the sound palette and the shortcut cheat sheet -->
    <GlobalHotkeys />

    <!-- Shown after downgrade when the user has more active campaigns than their free-plan limit -->
    <DowngradeCampaignPickerModal
      :show="showDowngradePicker"
      :campaign-limit="campaignLimit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopBar from "@/components/layout/AppTopBar.vue";
import DmBottomNav from "@/components/layout/DmBottomNav.vue";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import NpcGeneratorPanel from "@/components/npcs/NpcGeneratorPanel.vue";
import MonsterGeneratorPanel from "@/components/monsters/MonsterGeneratorPanel.vue";
import ItemGeneratorPanel from "@/components/items/ItemGeneratorPanel.vue";
import PuzzleGeneratorPanel from "@/components/puzzles/PuzzleGeneratorPanel.vue";
import SpellGeneratorPanel from "@/components/spells/SpellGeneratorPanel.vue";
import QuestGeneratorPanel from "@/components/quests/QuestGeneratorPanel.vue";
import TrapGeneratorPanel from "@/components/traps/TrapGeneratorPanel.vue";
import FactionGeneratorPanel from "@/components/factions/FactionGeneratorPanel.vue";
import LocationGeneratorPanel from "@/components/locations/LocationGeneratorPanel.vue";
import RollTableGeneratorPanel from "@/components/dungeon-features/RollTableGeneratorPanel.vue";
import AiGenerationBadge from "@/components/common/AiGenerationBadge.vue";
import SoundboardWidget from "@/components/soundboard/SoundboardWidget.vue";
import GlobalHotkeys from "@/components/layout/GlobalHotkeys.vue";
import DowngradeCampaignPickerModal from "@/components/billing/DowngradeCampaignPickerModal.vue";
import SuspensionBanner from "@/components/billing/SuspensionBanner.vue";
import { useAudioThemeTriggers } from "@/composables/useAudioThemeTriggers";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useCampaignLiveSync } from "@/composables/useCampaignLiveSync";
import { usePartyLive } from "@/composables/useParty";
import { useCampaigns } from "@/composables/useCampaigns";
import { useSubscription } from "@/composables/useSubscription";
import { usePlan } from "@/composables/usePlan";
import { initPlaceholderFocalPoints } from "@/lib/placeholderFocalPoints";

// Eagerly pre-fetch admin-configured placeholder focal points so FocalImage
// has the data available before it runs smartcrop as a fallback.
void initPlaceholderFocalPoints();

// Full-screen mobile takeover routes (e.g. NPC detail/edit) render their own
// top + bottom bars, so the global AppTopBar / DmBottomNav are suppressed and
// the <main> bottom padding dropped. Only below md — desktop is never affected.
// This is deliberately phone-width-only regardless of pointer type: tablets
// get desktop-style detail views plus the bar, never the full-screen takeover.
const route = useRoute();
const isMobile = useMediaQuery("(max-width: 767px)");
const fullscreenMobile = computed(() => isMobile.value && !!route.meta.fullscreenMobile);

useCampaignPresence();
useCampaignLiveSync();
usePartyLive();

// Listens for encounters and locations asking for a theme. Mounted here rather
// than on the soundboard page because the DM is looking at the encounter when
// it fires, not at the board.
useAudioThemeTriggers();

const { isPro } = useSubscription();
const { data: campaigns } = useCampaigns();
const { data: freePlan } = usePlan("free");

const campaignLimit = computed(() => freePlan.value?.quotas.campaigns ?? 1);

const showDowngradePicker = computed(() => {
  if (isPro.value) return false;
  const count = campaigns.value?.length ?? 0;
  return count > campaignLimit.value;
});
</script>
