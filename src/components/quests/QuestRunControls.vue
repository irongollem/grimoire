<template>
  <nav class="sticky bottom-2 z-20 space-y-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur" aria-label="Quest runtime controls">
    <div v-if="outgoing.length" class="space-y-2">
      <AppInput v-if="outgoing.length > 4" v-model="branchSearch" placeholder="Filter branches…" />
      <div class="grid gap-2 sm:grid-cols-2">
        <article v-for="choice in filteredOutgoing" :key="choice.edge_id" class="space-y-2 rounded-lg border border-border bg-card p-3">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ choice.beat_kind }}</span>
            <span v-if="choice.presentationHint" class="text-caption text-muted-foreground">{{ choice.presentationHint }}</span>
            <span v-if="choice.isVisited" class="rounded bg-primary/10 px-1.5 py-0.5 text-label text-primary">Visited</span>
            <span v-if="choice.prepGapCount" class="rounded bg-tone-caution/10 px-1.5 py-0.5 text-label text-tone-caution">{{ choice.prepGapCount }} gap{{ choice.prepGapCount === 1 ? '' : 's' }}</span>
          </div>
          <div>
            <p class="font-cinzel text-sm font-bold text-foreground">{{ choice.beat_title }}</p>
            <p class="text-caption text-muted-foreground">{{ choice.label || "Continue" }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton label="Choose" size="sm" variant="primary" :disabled="navigationDisabled" @click="emit('advance', choice.edge_id)" />
            <AppButton
              v-if="choice.visibility !== 'revealed'"
              :label="choice.visibility === 'rumored' ? 'Reveal fully' : 'Reveal to players'"
              size="sm"
              variant="subtle"
              :disabled="disabled"
              @click="emit('reveal', choice.beat_id)"
            />
            <span v-else class="self-center text-caption text-elven-green">Visible to players</span>
          </div>
        </article>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <AppButton label="Previous" variant="subtle" :disabled="navigationDisabled || !hasPrevious" @click="emit('previous')" />
      <AppButton v-if="!outgoing.length" label="No authored next beat" variant="subtle" disabled />
      <AppButton label="Jump…" variant="subtle" :disabled="navigationDisabled" @click="emit('jump')" />
      <AppButton v-if="!outgoing.length" label="Improvise…" variant="subtle" :disabled="navigationDisabled" @click="emit('improv')" />
      <div class="ml-auto flex gap-2">
        <AppButton v-if="status === 'running'" label="Pause" variant="subtle" :disabled="disabled" @click="emit('pause')" />
        <AppButton v-else-if="status === 'paused'" label="Resume" variant="primary" :disabled="disabled" @click="emit('resume')" />
        <AppButton label="End" variant="destructive" :disabled="disabled" @click="emit('end')" />
      </div>
    </div>
    <p class="text-caption text-muted-foreground">Shortcuts: Alt+← previous · Alt+→ next when unambiguous · J jump</p>
  </nav>
</template>

<script setup lang="ts">
import type { QuestRuntimeStatus } from "@/types/quest.types";
import type { QuestRunBranchChoice } from "@/lib/quests/run";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { computed, ref } from "vue";

const props = defineProps<{ status: QuestRuntimeStatus; hasPrevious: boolean; outgoing: QuestRunBranchChoice[]; disabled?: boolean }>();
const navigationDisabled = computed(() => props.disabled || props.status !== "running");
const branchSearch = ref("");
const filteredOutgoing = computed(() => {
  const query = branchSearch.value.trim().toLowerCase();
  if (!query) return props.outgoing;
  return props.outgoing.filter((choice) => `${choice.beat_title} ${choice.label} ${choice.beat_kind}`.toLowerCase().includes(query));
});
const emit = defineEmits<{
  previous: [];
  advance: [edgeId: string];
  reveal: [beatId: string];
  jump: [];
  improv: [];
  pause: [];
  resume: [];
  end: [];
}>();
</script>
