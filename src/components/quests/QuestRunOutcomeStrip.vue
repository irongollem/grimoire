<template>
  <section class="flex flex-col gap-2" aria-label="What happened">
    <h3 class="font-cinzel text-sm font-bold text-foreground">What happens next</h3>
    <AppInput v-if="outgoing.length > 4" v-model="branchSearch" placeholder="Filter branches…" />
    <div class="grid gap-2">
      <article v-for="choice in filteredOutgoing" :key="choice.edge_id" class="space-y-2 rounded-lg border border-border bg-card p-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ choice.beat_kind }}</span>
          <span v-if="choice.presentationHint" class="text-caption text-muted-foreground">{{ choice.presentationHint }}</span>
          <span v-if="choice.isVisited" class="rounded bg-primary/10 px-1.5 py-0.5 text-label text-primary">Visited</span>
          <span v-if="choice.prepGapCount" class="rounded bg-tone-caution/10 px-1.5 py-0.5 text-label text-tone-caution">{{ choice.prepGapCount }} gap{{ choice.prepGapCount === 1 ? '' : 's' }}</span>
        </div>
        <div>
          <p class="font-cinzel text-sm font-bold text-foreground">{{ choice.beat_title }}</p>
          <!-- An ungated route says nothing here — most routes genuinely have
               no gate (#795), and a fallback like "Continue" would claim
               there was always something to say. -->
          <p v-if="choice.gate" class="text-caption" :class="choice.gate.is_open ? 'text-muted-foreground' : 'text-destructive'">{{ describeQuestRouteGate(choice.gate) }}</p>
          <p v-for="(effect, index) in choice.effects" :key="index" class="text-caption text-muted-foreground">{{ describeQuestRouteEffect(effect) }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton label="Choose" size="sm" variant="primary" :disabled="navigationDisabled || isClosed(choice)" @click="emit('advance', choice.edge_id)" />
          <AppButton label="Preview as players" size="sm" variant="subtle" @click="emit('preview', choice.beat_id)" />
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

      <!-- The fork's open-ended option: no target beat exists yet, so naming
           what happened here is what creates one (#794's ledger still applies
           once it does). Its form opens in this same column, in normal flow —
           the #776 fix this strip exists to keep from regressing. -->
      <article class="space-y-2 rounded-lg border border-dashed border-border bg-card p-3">
        <template v-if="!improviseOpen">
          <p class="font-cinzel text-sm font-bold text-foreground">Something else…</p>
          <p class="text-caption text-muted-foreground">Name what just happened and it becomes a beat.</p>
          <AppButton label="Something else…" size="sm" variant="subtle" :disabled="navigationDisabled" @click="improviseOpen = true" />
        </template>
        <QuestRunImprovPanel v-else @close="improviseOpen = false" @submit="(value) => emit('improv', value)" />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Concern 3 of the run cockpit (#820, epic #780): "what happened" — one card
 * per outgoing route plus the open-ended improvise option, extracted out of
 * the old `QuestRunControls` so the cockpit can dock it to the bottom of its
 * own column in normal document flow. `QuestRunControls` keeps the session-
 * wide commands (Previous, Jump, Pause/Resume, End) that are not an outcome
 * of *this* beat.
 *
 * This is the surface #776 fixed once already: its predecessor's `sticky
 * bottom-2` bar pinned to a clipped viewport and swallowed everything below
 * it. Nothing here is sticky or fixed — the parent docks it with `mt-auto`
 * inside a flex column instead, which stays in flow and cannot clip content.
 */
import { computed, ref } from "vue";
import type { QuestRuntimeStatus } from "@/types/quest.types";
import type { QuestRunBranchChoice } from "@/lib/quests/run";
import { describeQuestRouteEffect, describeQuestRouteGate } from "@/lib/quests/gates";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import QuestRunImprovPanel from "./QuestRunImprovPanel.vue";

const props = defineProps<{ status: QuestRuntimeStatus; outgoing: QuestRunBranchChoice[]; disabled?: boolean }>();
const navigationDisabled = computed(() => props.disabled || props.status !== "running");
function isClosed(choice: QuestRunBranchChoice) {
  return !!choice.gate && !choice.gate.is_open;
}
const branchSearch = ref("");
const filteredOutgoing = computed(() => {
  const query = branchSearch.value.trim().toLowerCase();
  if (!query) return props.outgoing;
  return props.outgoing.filter((choice) => `${choice.beat_title} ${choice.gate?.objective ?? ""} ${choice.beat_kind}`.toLowerCase().includes(query));
});
// Owned by the parent, not this strip: a failed submit must leave the form
// open for the DM to retry, and only the cockpit knows the mutation outcome.
const improviseOpen = defineModel<boolean>("improviseOpen", { required: true });
const emit = defineEmits<{
  advance: [edgeId: string];
  reveal: [beatId: string];
  preview: [beatId: string];
  improv: [value: { title: string; kind: string; reason: string; dmLead: string; revealText: string; pushReturn: boolean; keepEdge: boolean }];
}>();
</script>
