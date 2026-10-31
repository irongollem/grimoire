<template>
  <header class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2">
    <!-- A fight started from exploring a site goes back to that site (frame 09), else to the encounters list. -->
    <AppButton
      v-if="site"
      variant="ghost"
      size="sm"
      :icon="IconChevronLeft"
      :label="site.name"
      :to="exploreRoute(site.id)"
      data-testid="play-back-to-site"
    />
    <AppButton v-else variant="ghost" size="sm" :icon="IconChevronLeft" label="Encounters" to="/encounters" />
    <h1 class="max-w-[16rem] truncate text-heading-sm font-bold text-foreground">{{ store.encounterName }}</h1>

    <span
      v-if="store.round > 0"
      data-testid="play-round-chip"
      class="rounded-full border border-border bg-secondary px-3 py-1 text-label-lg font-semibold text-foreground"
    >
      Fighting · Round {{ store.round }}
    </span>
    <template v-else>
      <AppButton
        v-if="!store.started"
        variant="primary"
        size="sm"
        :icon="IconDiceRoll"
        label="Roll Initiative"
        tooltip="Roll initiative for everyone who hasn't rolled yet"
        :disabled="store.rollingInitiative"
        @click="emit('roll-initiative')"
      />
      <AppButton
        variant="live"
        size="sm"
        :icon="IconEncounter"
        label="Start Combat"
        :disabled="store.rollingInitiative"
        @click="emit('start-combat')"
      />
    </template>

    <ManualHelpLink page="encounter-runner" />

    <div class="ml-auto flex flex-wrap items-center gap-2">
      <!-- While live this button stops it, so its name says so: "● Live" alone named the state and
           hid the action. `go-live-btn` and `live-active` carry no style: scripts/promo waits on them. -->
      <AppButton
        v-if="canGoLive"
        class="go-live-btn"
        :class="{ 'live-active': isLive }"
        :variant="isLive ? 'tinted' : 'outline'"
        tone="success"
        size="sm"
        :icon="IconLive"
        :label="goingLive ? 'Starting…' : isLive ? '● Live' : 'Go Live'"
        :aria-label="isLive ? 'Live. Stop sharing with players' : undefined"
        :tooltip="isLive ? 'Live. Click to stop sharing with players' : appUi.sessionRunning ? 'Go Live' : 'Go Live (also starts the session)'"
        :disabled="goingLive"
        @click="emit('go-live')"
      />
      <AppButton
        variant="outline"
        size="sm"
        :icon="IconMonitor"
        label="Table screen"
        :tooltip="isLive ? 'Open the table screen in a new window (for a second monitor)' : 'Go live first. The table screen follows the live fight.'"
        :disabled="!isLive"
        @click="emit('table-screen')"
      />
      <PlayViewMenu v-model="view" @reset-view="emit('reset-view')" />
      <span class="relative inline-flex">
        <AppButton variant="outline" size="sm" :icon="IconTool" label="Tools" @click="emit('tools')" />
        <span
          v-if="toolsBadge > 0"
          data-testid="tools-badge"
          class="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-eyebrow font-bold text-primary-foreground"
        >{{ toolsBadge }}</span>
      </span>
      <OverflowMenu label="More combat actions" variant="ghost" size="icon-sm" :items="overflowItems" @select="onOverflow" />
      <AppButton
        variant="tinted"
        tone="danger"
        emphasis="outline"
        size="sm"
        :icon="IconFlag"
        label="End fight"
        @click="emit('end-fight')"
      />

      <span class="mx-1 h-6 w-px bg-border" aria-hidden="true"></span>

      <AppButton
        variant="ghost"
        size="sm"
        :icon="IconChevronLeft"
        aria-label="Previous turn"
        :disabled="store.round === 0"
        @click="store.prevTurn()"
      />
      <TurnTimer
        v-if="turnTimerSeconds !== null && store.round > 0"
        :seconds="turnTimerSeconds"
        :reset-key="turnResetKey"
      />
      <AppButton
        variant="primary"
        size="md"
        label="Next turn"
        :icon-right="IconChevronRight"
        :disabled="store.round === 0"
        @click="store.nextTurn()"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconChevronLeft, IconChevronRight, IconDiceRoll, IconEncounter, IconFlag, IconLive, IconMonitor, IconTool } from "@/lib/icons";
import { useEncounterSite } from "@/composables/locations/useEncounterSite";
import { exploreRoute } from "@/lib/locations/placeRoute";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAppUiStore } from "@/stores/ui/app";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";
import TurnTimer from "../TurnTimer.vue";
import PlayViewMenu from "./PlayViewMenu.vue";
import type { PlayViewState } from "./playTypes";

/**
 * The Play screen's bar (#1125 frame 10): where we are, the turn controls, and the few things a
 * DM reaches for mid-fight. Everything else is in the View menu, the Tools sheet or the overflow.
 */
const { encounterId, isLive, goingLive, canGoLive, canGenerate, turnTimerSeconds, turnResetKey } = defineProps<{
  encounterId: string;
  isLive: boolean;
  goingLive: boolean;
  /** A campaign is active, so there is a table to go live to. */
  canGoLive: boolean;
  /** The campaign's AI is on, so the complication and reinforcement generators are offered. */
  canGenerate: boolean;
  turnTimerSeconds: number | null;
  turnResetKey: string | number;
}>();

const view = defineModel<PlayViewState>("view", { required: true });
const emit = defineEmits<{
  "roll-initiative": [];
  "start-combat": [];
  "go-live": [];
  "table-screen": [];
  "reset-view": [];
  tools: [];
  generate: [mode: ComplicationMode];
  abandon: [];
  "end-fight": [];
}>();

const store = useEncounterRunStore();
const site = useEncounterSite(() => encounterId);
const appUi = useAppUiStore();

/** Events not yet fired plus traps: what the DM may still need from the Tools sheet. */
const toolsBadge = computed(
  () => store.events.filter((e) => !store.eventsFired.includes(e.id)).length + store.traps.length,
);

const overflowItems = computed<OverflowMenuEntry[]>(() => {
  const items: OverflowMenuEntry[] = [];
  if (canGenerate) {
    items.push({ key: "generate-complication", label: "Generate a complication" });
    items.push({ key: "generate-reinforcements", label: "Generate reinforcements" });
  }
  items.push({ key: "abandon", label: "Abandon run", danger: true });
  return items;
});

function onOverflow(key: string) {
  if (key === "generate-complication") emit("generate", "complication");
  else if (key === "generate-reinforcements") emit("generate", "reinforcements");
  else if (key === "abandon") emit("abandon");
}
</script>
