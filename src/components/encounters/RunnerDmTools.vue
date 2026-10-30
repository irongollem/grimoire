<template>
  <!-- Nothing at all when the fight has no events or traps: most fights
       have none, and the initiative list is what the DM needs the room for. -->
  <section
    v-if="hasContent"
    class="runner-dm-tools"
    :class="layout === 'stack' ? 'flex flex-col gap-3' : 'flex flex-col gap-1'"
    aria-label="Events and traps"
  >
    <div v-if="store.events.length || store.traps.length" :class="layout === 'stack' ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-x-4 gap-y-1'">
      <div v-if="store.events.length" class="flex flex-wrap items-center gap-1.5" data-testid="runner-events">
        <span :class="groupLabel">Events</span>
        <template v-for="event in store.events" :key="event.id">
          <AppButton
            v-if="canFire(event)"
            :variant="isFired(event) ? 'subtle' : 'tinted'"
            tone="caution"
            :size="chipSize"
            :icon="IconPlay"
            :aria-label="`Fire ${event.name}`"
            :tooltip="fireTooltip(event)"
            data-testid="runner-event-fire"
            @click="store.fireEvent(event.id)"
          >
            <span class="truncate">{{ event.name }}</span>
            <span class="shrink-0 font-normal opacity-70">{{ triggerLabel(event.trigger) }}</span>
          </AppButton>
          <span
            v-else
            class="inline-flex items-center gap-1 text-muted-foreground"
            :class="layout === 'stack' ? 'text-label' : 'text-caption'"
            :title="`${event.name} has fired`"
          >
            <IconCheck class="h-3 w-3 text-ink-success" aria-hidden="true" />
            {{ event.name }}
          </span>
        </template>
      </div>

      <div v-if="store.traps.length" class="flex flex-wrap items-center gap-1.5" data-testid="runner-traps">
        <span :class="groupLabel">Traps</span>
        <AppButton
          v-for="trap in store.traps"
          :key="trap.id"
          variant="subtle"
          surface="card"
          :size="chipSize"
          :active="selectedTrapId === trap.id"
          :aria-label="trap.name"
          :tooltip="trapTooltip(trap)"
          @click="toggleTrapDetail(trap.id)"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: trapTypeColor(trap.trap_type) }" aria-hidden="true" />
          <span class="truncate">{{ trap.name }}</span>
          <span v-if="trap.save_dc" class="shrink-0 font-normal opacity-70">DC {{ trap.save_dc }}</span>
          <span v-if="trap.damage_entries?.length" class="shrink-0 font-normal opacity-70">{{ trap.damage_entries.map((e) => e.dice).join('+') }}</span>
        </AppButton>
      </div>
    </div>

    <!-- Standing hazards from fired environment_effect actions (#604): derived,
         see store.activeEnvironmentEffects. Written out in full, because they stay
         true for the rest of the fight and the DM has to keep applying them. -->
    <ul v-if="store.activeEnvironmentEffects.length" class="flex flex-col gap-0.5" data-testid="runner-hazards">
      <li
        v-for="(effect, i) in store.activeEnvironmentEffects"
        :key="i"
        class="flex items-baseline gap-1.5"
        :class="layout === 'stack' ? 'text-label' : 'text-caption'"
      >
        <IconWarning class="h-3 w-3 shrink-0 self-center text-ink-caution" aria-hidden="true" />
        <span class="font-semibold text-ink-caution">{{ effect.label }}</span>
        <span class="text-muted-foreground">{{ effect.description }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * The fight's scripted events, the hazards they left in play, and its traps, as
 * one strip of chips. It used to be two 200px columns down the right edge of the
 * runner, always drawn because the AI generator buttons lived in the first one,
 * which cost every fight the width its initiative rows needed for something most
 * fights never use (30 Oct 2026). The generators now sit in the top bar
 * (RunnerGenerateMenu) and the phone's overflow menu, so this draws only what the
 * encounter actually has.
 *
 * "strip" sits above the initiative list on a desktop; "stack" is the phone's
 * combat-tools sheet, where each group takes its own line at thumb size.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { TRAP_TYPE_VAR } from "@/types/trap.types";
import type { EncounterEvent, EventTrigger } from "@/types/encounter.types";
import type { TrapEntry } from "@/types/trap.types";
import { IconCheck, IconPlay, IconWarning } from "@/lib/icons";

const { layout = "strip" } = defineProps<{ layout?: "strip" | "stack" }>();

const selectedTrapId = defineModel<string | null>("selectedTrapId", { required: true });

const store = useEncounterRunStore();

// A hazard in play comes from a fired event, so events cover it.
const hasContent = computed(() => store.events.length > 0 || store.traps.length > 0);

const chipSize = computed(() => (layout === "stack" ? "md" : "xs"));
// On the phone each group's name heads its own line of chips.
const groupLabel = computed(() => (layout === "stack" ? "w-full text-eyebrow text-muted-foreground" : "text-eyebrow text-muted-foreground"));

function isFired(event: EncounterEvent): boolean {
  return store.eventsFired.includes(event.id);
}

/** A once-only event that has gone off is done; anything else can still be fired by hand. */
function canFire(event: EncounterEvent): boolean {
  return !isFired(event) || !event.fire_once;
}

function fireTooltip(event: EncounterEvent): string {
  if (isFired(event)) return `Fired. Fire ${event.name} again`;
  if (event.trigger.type === "manual") return `Fire ${event.name}`;
  return `Fire ${event.name} now. It fires itself on: ${triggerLabel(event.trigger)}`;
}

function triggerLabel(trigger: EventTrigger): string {
  if (trigger.type === "round_start") return `Round ${trigger.round}`;
  if (trigger.type === "combatant_hp_pct") return `HP ≤ ${trigger.pct}%`;
  if (trigger.type === "combatant_dies") return "On death";
  return "Manual";
}

function trapTooltip(trap: TrapEntry): string {
  const kind = [trap.trap_type, trap.trigger_type].filter(Boolean).join(", ");
  return kind ? `${trap.name}: ${kind}. Open its detail` : `${trap.name}. Open its detail`;
}

function trapTypeColor(trapType: string): string {
  return TRAP_TYPE_VAR[trapType as keyof typeof TRAP_TYPE_VAR] ?? "var(--muted-foreground)";
}

function toggleTrapDetail(id: string) {
  selectedTrapId.value = selectedTrapId.value === id ? null : id;
}
</script>
