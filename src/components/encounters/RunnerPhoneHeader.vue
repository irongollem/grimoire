<template>
  <header class="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
    <AppButton
      variant="ghost"
      size="icon-sm"
      :class="ICON_TOUCH_TARGET"
      :icon="IconChevronLeft"
      aria-label="Back to builder"
      :to="`/encounters/${encounterId}`"
    />

    <div class="min-w-0 flex-1 leading-tight">
      <div class="truncate text-label-lg font-bold text-foreground">{{ store.encounterName }}</div>
      <div class="flex items-center gap-2 text-caption text-muted-foreground">
        <span>{{ store.round === 0 ? "Pre-combat" : `Round ${store.round}` }}</span>
        <TurnTimer
          v-if="turnTimerSeconds !== null && store.round > 0"
          :seconds="turnTimerSeconds"
          :reset-key="turnResetKey"
        />
        <span v-if="isLive" class="font-semibold text-ink-success">● Live</span>
      </div>
    </div>

    <span class="relative inline-flex">
      <AppButton
        variant="ghost"
        size="icon-sm"
        :class="ICON_TOUCH_TARGET"
        :icon="IconTool"
        aria-label="Combat tools"
        @click="emit('tools')"
      />
      <span
        v-if="toolsBadge > 0"
        data-testid="tools-badge"
        class="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-eyebrow font-bold text-primary-foreground"
      >{{ toolsBadge }}</span>
    </span>

    <OverflowMenu label="More combat actions" variant="ghost" :items="menuItems" @select="onSelect" />
  </header>
</template>

<script setup lang="ts">
/**
 * The phone's runner header: one row. Everything that used to be six unlabelled
 * icons lives in the overflow menu with a name, and the two that end a run are
 * last in it, behind a rule, so they cannot be hit by mistake.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/controls/appButtonVariants";
import OverflowMenu from "@/components/common/overlays/OverflowMenu.vue";
import type { OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconChevronLeft, IconTool } from "@/lib/icons";
import { manualPageRoute } from "@/lib/nav";
import { useEncounterRunStore } from "@/stores/encounterRun";
import TurnTimer from "./TurnTimer.vue";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";

const {
  encounterId,
  isLive,
  goingLive,
  canGoLive,
  canOpenBattleMap,
  battleMapDisabledReason,
  turnTimerSeconds,
  turnResetKey,
  canGenerate,
} = defineProps<{
  encounterId: string;
  isLive: boolean;
  goingLive: boolean;
  /** A campaign is active, so there is a table to go live to. */
  canGoLive: boolean;
  canOpenBattleMap: boolean;
  battleMapDisabledReason: string;
  turnTimerSeconds: number | null;
  turnResetKey: string | number;
  /** The campaign's AI is on, so the complication and reinforcement generators are offered. */
  canGenerate: boolean;
}>();

const emit = defineEmits<{
  tools: [];
  "go-live": [];
  "battle-map": [];
  "battle-map-window": [];
  "roll-initiative": [];
  generate: [mode: ComplicationMode];
  abandon: [];
  "end-combat": [];
}>();

const store = useEncounterRunStore();
const router = useRouter();

/** Events not yet fired plus traps: what the DM may still need from the sheet. */
const toolsBadge = computed(
  () => store.events.filter((e) => !store.eventsFired.includes(e.id)).length + store.traps.length,
);

const menuItems = computed<OverflowMenuEntry[]>(() => {
  const items: OverflowMenuEntry[] = [];
  if (canGoLive) {
    items.push({ key: "go-live", label: isLive ? "Stop live" : "Go live", disabled: goingLive });
  }
  items.push({
    key: "battle-map",
    label: "Battle map",
    disabled: !canOpenBattleMap,
    reason: canOpenBattleMap ? undefined : battleMapDisabledReason,
  });
  // A second window follows the live fight (#1120): before going live it has nothing to show.
  if (canOpenBattleMap) {
    items.push({
      key: "battle-map-window",
      label: "Open map in a new window",
      disabled: !isLive,
      reason: isLive ? undefined : "Go live first. The new window follows the live fight.",
    });
  }
  if (!store.started) items.push({ key: "roll-initiative", label: "Roll initiative for everyone left", disabled: store.rollingInitiative });
  if (canGenerate) {
    items.push({ key: "generate-complication", label: "Generate a complication" });
    items.push({ key: "generate-reinforcements", label: "Generate reinforcements" });
  }
  items.push({ key: "manual", label: "How the runner works" });
  items.push({ key: "abandon", label: "Abandon run", danger: true });
  items.push({ key: "end-combat", label: "End combat", danger: true });
  return items;
});

function onSelect(key: string) {
  if (key === "manual") void router.push(manualPageRoute("encounter-runner"));
  else if (key === "go-live") emit("go-live");
  else if (key === "battle-map") emit("battle-map");
  else if (key === "battle-map-window") emit("battle-map-window");
  else if (key === "roll-initiative") emit("roll-initiative");
  else if (key === "generate-complication") emit("generate", "complication");
  else if (key === "generate-reinforcements") emit("generate", "reinforcements");
  else if (key === "abandon") emit("abandon");
  else if (key === "end-combat") emit("end-combat");
}
</script>
