<template>
  <section
    v-if="siblingBadges.length || chains.length"
    aria-labelledby="open-chains-heading"
    class="space-y-1 rounded-xl border border-border bg-card p-3"
  >
    <div class="px-2">
      <h2 id="open-chains-heading" class="font-cinzel text-sm font-bold text-foreground">Also open</h2>
    </div>
    <div
      v-for="badge in siblingBadges"
      :key="badge.thread.id"
      class="flex items-center gap-2 rounded-lg border p-2"
      :class="badge.tone.border"
    >
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" :class="[badge.tone.bg, badge.tone.text]">
        <IconThread class="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-cinzel text-sm font-semibold text-foreground">{{ threadTitle(badge) }}</span>
        <span class="block truncate text-caption text-muted-foreground">this quest · {{ describeThreadCursor(badge.thread) }}</span>
      </span>
      <AppButton label="Switch" size="xs" @click="emit('switch-thread', badge.thread.id)" />
    </div>
    <QuestChainRow v-for="chain in chains" :key="chain.quest_id" :chain="chain" />
    <!-- The distinction that matters at the table: switching costs nothing,
         while Jump moves a cursor and asks why. -->
    <p class="px-2 text-caption text-muted-foreground">Sibling threads first, other quests after.</p>
  </section>
</template>

<script setup lang="ts">
/**
 * The chains — and now the threads — the party has open besides the one
 * being run (#853, story F, `Runner` board: "Also open" already promised the
 * cockpit could hold several threads; this is that promise kept). Sibling
 * threads of this quest are rows of their own, since switching to one is
 * free navigation rather than the "open another quest's Run surface" jump
 * `QuestChainRow` performs; they list first because they cost nothing,
 * exactly as the caption says.
 */
import { computed } from "vue";
import QuestChainRow from "./QuestChainRow.vue";
import AppButton from "@/components/common/AppButton.vue";
import { threadBadges, threadTitle } from "@/lib/quests/threads";
import { describeThreadCursor } from "@/lib/quests/run";
import { IconNetwork as IconThread } from "@/lib/icons";
import type { CampaignLiveQuest, QuestThreadCursor } from "@/types/quest.types";

const { chains, threads, threadId } = defineProps<{
  chains: CampaignLiveQuest[];
  threads: QuestThreadCursor[];
  threadId: string;
}>();
const emit = defineEmits<{ "switch-thread": [threadId: string] }>();

const siblingBadges = computed(() => threadBadges(threads)
  .filter((badge) => badge.thread.id !== threadId && (badge.thread.status === "live" || badge.thread.status === "waiting")));
</script>
