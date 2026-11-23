<template>
  <section v-if="clocks.length" class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Clocks">
    <h3 class="text-heading-sm font-bold text-foreground">Clocks</h3>
    <ul class="flex flex-col gap-2">
      <li v-for="clock in clocks" :key="clock.id" class="flex items-center gap-2">
        <QuestClockDial :label="clock.label" :segments="clock.segments" :filled="clock.filled" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-caption text-foreground">{{ clock.label }}</span>
          <span class="block text-caption text-muted-foreground">{{ clockProgressLabel(clock.filled, clock.segments) }}</span>
          <RouterLink
            v-if="clock.moves_force_id !== null"
            :to="`/canon?entry=${clock.moves_force_id}`"
            class="block truncate text-caption text-muted-foreground hover:underline"
          >Moves {{ forceName(clock.moves_force_id) }}</RouterLink>
        </span>
        <AppButton
          variant="subtle"
          size="icon-xs"
          :icon="IconMinus"
          :disabled="clock.filled <= 0 || ticking"
          :aria-label="`Untick ${clock.label}`"
          :tooltip="`Untick ${clock.label}`"
          @click="tick(clock, -1)"
        />
        <AppButton
          variant="subtle"
          size="icon-xs"
          :icon="IconAdd"
          :disabled="clock.filled >= clock.segments || ticking"
          :aria-label="`Tick ${clock.label}`"
          :tooltip="`Tick ${clock.label}`"
          @click="tick(clock, 1)"
        />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * The run cockpit's clocks (#1011): each clock's dial with Tick and Untick. A
 * tick that fills a clock fires its rules server-side, so the toast says so.
 * A clock that moves a force says so under its dial (#1255 item 20). Renders nothing for a quest without clocks.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useToast } from "@/composables/useToast";
import { useQuestClocks, useTickQuestClock } from "@/composables/quests/useQuestClocks";
import { IconAdd, IconMinus } from "@/lib/icons";
import { clockProgressLabel } from "@/lib/quests/clockDial";
import type { QuestClock } from "@/types/quest.types";
import QuestClockDial from "../inspector/QuestClockDial.vue";

const { questId } = defineProps<{ questId: string }>();
const { data } = useQuestClocks(computed(() => questId));
const clocks = computed(() => data.value ?? []);
const { mutateAsync: tickClock, isPending: ticking } = useTickQuestClock();
const toast = useToast();

// A clock that moves a force names it. Ticking is the same call as any clock's: the database ticks the force, never this client.
const { data: entries } = useCanonEntries();
const forceTitles = computed(() => new Map((entries.value ?? []).map((e) => [e.id, e.title])));
const forceName = (id: string) => forceTitles.value.get(id) ?? "a force";

async function tick(clock: QuestClock, step: 1 | -1) {
  try {
    const result = await tickClock({ clockId: clock.id, questId, step });
    if (result.filled_up) toast.success(`${clock.label} filled. Its rules fired.`);
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}
</script>
