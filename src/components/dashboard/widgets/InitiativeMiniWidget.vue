<template>
  <DashboardWidget v-if="miniState" title="Initiative Tracker">
    <template #action>
      <div class="flex items-center gap-2">
        <AppButton
          as="span"
          variant="tinted"
          tone="info"
          emphasis="soft"
          size="xs"
          :label="`Round ${miniState.round}`"
        />
        <AppButton
          :to="`/encounters/${miniState.encounterId}/run`"
          variant="link"
          size="inline-xs"
          label="Runner →"
        />
      </div>
    </template>

    <div class="divide-y divide-border">
      <div
        v-for="row in miniState.rows"
        :key="row.instanceId"
        class="flex items-center gap-3 px-4 py-2"
        :class="row.isActive && 'bg-primary/10'"
      >
        <span class="w-7 shrink-0 text-center font-cinzel text-caption-sm text-muted-foreground">
          {{ row.initiative === null ? "—" : row.initiative }}
        </span>

        <div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
          <p
            class="truncate font-cinzel text-sm font-semibold"
            :class="row.type === 'player' ? 'text-foreground' : 'text-muted-foreground'"
          >
            {{ row.name }}
          </p>
          <!-- Plain text, not a control — mirrors RunnerCombatantRow's own
               dead-monster marker so a downed monster reads the same way here
               as it does in the runner itself. -->
          <span
            v-if="row.type === 'monster' && row.hpState === 'downed'"
            class="text-xs text-destructive"
            aria-hidden="true"
          >☠</span>
          <AppButton
            v-if="row.isActive"
            as="span"
            variant="tinted"
            tone="primary"
            emphasis="strong"
            size="xs"
            label="Now"
          />
          <AppButton
            v-else-if="row.isNext"
            as="span"
            variant="tinted"
            tone="info"
            emphasis="soft"
            size="xs"
            label="Next"
          />
        </div>

        <AppButton
          as="span"
          variant="tinted"
          :tone="HP_TONES[row.hpState]"
          emphasis="soft"
          size="xs"
          :label="`${row.hp}/${row.maxHp} HP`"
        />
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The self-hiding initiative mini-tracker (#764).
 *
 * `LiveEncounterBanner` already tells the DM combat is running and links to
 * the runner; this is the next step down, for the DM who wants to glance at
 * "whose turn, what round, how hurt" without leaving the dashboard for it.
 * Read-only by design — the encounter runner owns advancing turns and editing
 * HP, so there is no "next turn" control here, only the same facts the runner
 * already shows, reduced to a list.
 *
 * Renders nothing at all unless `deriveInitiativeMiniState` finds a running
 * encounter with combatants — that absence is the whole design, exactly like
 * `DeathSavesWidget`: no `loading`/`empty` slot, because there is no "nothing
 * to show yet" state, only "not shown". `useRunningEncounters` is the same
 * module-level singleton `LiveEncounterBanner` subscribes to, so mounting
 * both costs nothing extra — one realtime channel, ref-counted.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import { deriveInitiativeMiniState, type CombatantHpState } from "@/lib/dashboard/initiativeMini";
import type { ButtonTone } from "@/components/common/appButtonVariants";
import DashboardWidget from "../DashboardWidget.vue";

const { firstRunning } = useRunningEncounters();

const miniState = computed(() => deriveInitiativeMiniState(firstRunning.value));

/** Semantic tones for the HP pill — matches the danger/caution/success ladder
 *  every other tinted badge in the app already uses, rather than a bespoke
 *  colour scale for this one widget. */
const HP_TONES: Record<CombatantHpState, ButtonTone> = {
  healthy: "success",
  bloodied: "caution",
  downed: "danger",
};
</script>
