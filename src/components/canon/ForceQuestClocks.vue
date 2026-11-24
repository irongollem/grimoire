<template>
  <div v-if="moving.length > 0" class="flex flex-col gap-2" data-testid="force-quest-clocks">
    <span class="text-eyebrow text-muted-foreground">Moved by quest clocks</span>
    <p v-if="ended" class="text-caption text-muted-foreground" data-testid="force-quest-clocks-ended">It has ended, so these clocks no longer move it.</p>
    <ul class="flex flex-col gap-1">
      <li v-for="clock in moving" :key="clock.id" class="flex flex-wrap items-baseline gap-x-2 text-body text-foreground">
        <span>{{ clock.label }}</span>
        <RouterLink v-if="titleOf(clock)" :to="`/quests/${clock.quest_id}`" class="text-caption text-muted-foreground hover:underline">{{ titleOf(clock) }}</RouterLink>
        <span v-else class="text-caption italic text-muted-foreground">A quest that is gone</span>
        <span class="text-caption text-muted-foreground">{{ clockProgressLabel(clock.filled, clock.segments) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The quest clocks that move this force (#1255 item 20): each with its quest and "n of m". Ticking one at the table
 * ticks the force's clock too, written by the database with the clock's name as the note, so this only lists the tie.
 * Renders nothing when no clock moves the force. Quest clocks are DM-only rows, so the read is the DM's.
 */
import { computed } from "vue";
import { useCampaignQuestClocks } from "@/composables/quests/useQuestClocks";
import { useQuests } from "@/composables/quests/useQuests";
import { forceOutcome } from "@/lib/canon/canonClose";
import { clockProgressLabel } from "@/lib/quests/clockDial";
import type { CanonEntry } from "@/types/canon.types";
import type { QuestClock } from "@/types/quest.types";

const { entry } = defineProps<{ entry: CanonEntry }>();

const { data: clocks } = useCampaignQuestClocks(computed(() => entry.campaign_id));
const { data: quests } = useQuests();

const moving = computed(() => (clocks.value ?? []).filter((c) => c.moves_force_id === entry.id));
const ended = computed(() => forceOutcome(entry) !== null);
const titleById = computed(() => new Map((quests.value ?? []).map((q) => [q.id, q.title])));
const titleOf = (clock: QuestClock) => titleById.value.get(clock.quest_id) ?? null;
</script>
