<template>
  <section class="flex flex-col gap-2" aria-label="What happens next">
    <h3 v-if="!headless" class="font-cinzel text-sm font-bold text-foreground">What happens next</h3>
    <AppInput v-if="choices.length > 4" v-model="branchSearch" placeholder="Filter branches…" />
    <div class="grid gap-2">
      <article v-for="choice in filteredChoices" :key="choice.edge_id" class="space-y-2 rounded-lg border border-border bg-card p-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ choice.beat_kind }}</span>
          <span class="rounded bg-primary/10 px-1.5 py-0.5 text-label uppercase text-primary">choice</span>
          <span v-if="choice.isVisited" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">Visited</span>
          <span v-if="choice.prepGapCount" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">{{ choice.prepGapCount }} gap{{ choice.prepGapCount === 1 ? '' : 's' }}</span>
        </div>
        <div>
          <p class="font-cinzel text-sm font-bold text-foreground">{{ choice.beat_title }}</p>
          <p v-if="captionFor(choice)" class="text-caption" :class="choice.gate && !choice.gate.is_open ? 'text-destructive' : 'text-muted-foreground'">{{ captionFor(choice) }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton label="Choose" size="xs" variant="primary" :disabled="navigationDisabled || isClosed(choice)" @click="emit('choose', choice.edge_id)" />
          <AppButton label="Preview" size="xs" variant="subtle" @click="emit('preview', choice.beat_id)" />
          <AppButton
            v-if="choice.visibility !== 'revealed'"
            :label="choice.visibility === 'rumored' ? 'Reveal fully' : 'Reveal'"
            size="xs"
            variant="subtle"
            :disabled="disabled"
            @click="emit('reveal', choice.beat_id)"
          />
          <span v-else class="self-center text-caption text-elven-green">Visible to players</span>
        </div>
      </article>

      <article v-for="choice in parallelRoutes" :key="choice.edge_id" class="space-y-1 rounded-lg border border-tone-info/40 bg-tone-info/5 p-3">
        <span class="inline-flex items-center gap-1 rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">
          <IconParallel class="h-3 w-3" aria-hidden="true" />opens alongside
        </span>
        <p class="font-cinzel text-sm font-bold text-foreground">{{ choice.beat_title }}</p>
        <p class="text-caption text-muted-foreground">Ticked by default — advancing also spawns Thread {{ choice.thread_label }}.</p>
      </article>

      <!-- The fork's open-ended option: no target beat exists yet, so naming
           what happened here is what creates one. Opens the Advance dialog
           with its own improvise option selected (#853, story F/G) — the
           dialog is "the only place a thread is created," improvising
           included, so this strip no longer carries its own inline form. -->
      <article class="space-y-2 rounded-lg border border-dashed border-border bg-card p-3">
        <p class="font-cinzel text-sm font-bold text-foreground">Something else…</p>
        <p class="text-caption text-muted-foreground">Name what just happened and it becomes a beat.</p>
        <AppButton label="Something else…" size="sm" variant="subtle" :disabled="navigationDisabled" @click="emit('something-else')" />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * "What happens next" (#853, story F, `Runner` board) — one card per `choice`
 * route, one `opens alongside` card per `parallel` route, and the open-ended
 * improvise option. Neither `Choose` nor `Something else…` transitions on its
 * own click: `QuestAdvanceDialog` (story G) is "the only place a thread is
 * created," so this strip's job is naming the routes and letting the cockpit
 * open that dialog — preselected on a route, or with its improvise option
 * selected.
 */
import { computed, ref } from "vue";
import type { QuestRuntimeStatus } from "@/types/quest.types";
import type { QuestRunBranchChoice } from "@/lib/quests/run";
import { summarizeRoutePayoff } from "@/lib/quests/run";
import { routeCondition } from "@/lib/quests/ledger";
import { IconLinkAlt as IconParallel } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

const props = defineProps<{ status: QuestRuntimeStatus; outgoing: QuestRunBranchChoice[]; disabled?: boolean; headless?: boolean }>();
const navigationDisabled = computed(() => props.disabled || props.status !== "running");
const choices = computed(() => props.outgoing.filter((choice) => choice.route_kind === "choice"));
const parallelRoutes = computed(() => props.outgoing.filter((choice) => choice.route_kind === "parallel"));

function isClosed(choice: QuestRunBranchChoice) {
  return !!choice.gate && !choice.gate.is_open;
}
function captionFor(choice: QuestRunBranchChoice): string {
  const payoffCaption = summarizeRoutePayoff(choice.payoff[0]);
  if (payoffCaption) return payoffCaption;
  return routeCondition(choice.gate)?.text ?? "";
}

const branchSearch = ref("");
const filteredChoices = computed(() => {
  const query = branchSearch.value.trim().toLowerCase();
  if (!query) return choices.value;
  return choices.value.filter((choice) => `${choice.beat_title} ${choice.gate?.objective ?? ""} ${choice.beat_kind}`.toLowerCase().includes(query));
});
const emit = defineEmits<{
  choose: [edgeId: string];
  "something-else": [];
  reveal: [beatId: string];
  preview: [beatId: string];
}>();
</script>
