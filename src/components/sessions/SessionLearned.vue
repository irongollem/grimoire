<template>
  <section aria-labelledby="session-learned-heading" class="flex min-w-0 flex-col gap-3">
    <header class="flex items-baseline justify-between gap-3">
      <h2 id="session-learned-heading" class="text-heading font-semibold text-foreground">What the party learned</h2>
      <span v-if="entries.length" class="text-caption text-muted-foreground">{{ entries.length }}</span>
    </header>

    <div class="flex flex-col gap-5 rounded-lg border border-border bg-card p-4">
      <p v-if="isLoading" class="text-body text-muted-foreground">Loading…</p>
      <p v-else-if="error" class="text-body text-destructive">Could not read what the party learned.</p>
      <p v-else-if="!entries.length" class="font-fell italic text-muted-foreground">
        Nothing recorded for this session yet.
      </p>

      <section v-for="block in blocks" :key="block.kind" class="flex flex-col gap-2">
        <LearnedKindMark :kind="block.kind" :label="block.label" />
        <ul class="flex flex-col divide-y divide-border">
          <li v-for="entry in block.entries" :key="entry.key" class="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <RouterLink :to="learnedEntryLink(entry)" class="font-semibold text-foreground hover:underline">
                  {{ entry.name }}
                </RouterLink>
                <p v-if="entry.detail" class="whitespace-pre-line text-caption text-muted-foreground">
                  {{ entry.detail }}
                </p>
              </div>
              <AppButton
                v-if="entry.kind !== 'combat' && moving !== entry.key"
                variant="ghost"
                size="sm"
                label="Another session…"
                @click="moving = entry.key"
              />
            </div>
            <LearnedSessionSelect
              v-if="moving === entry.key"
              :exclude="sessionId"
              aria-label="Move to another session"
              @update:model-value="(target) => moveEntry(entry, target)"
            />
          </li>
        </ul>
      </section>

      <div class="border-t border-border pt-3">
        <SessionLearnedAdd v-if="adding" :session-id="sessionId" @done="adding = false" />
        <AppButton
          v-else
          variant="ghost"
          size="sm"
          label="+ Something they learned that you forgot to share"
          @click="adding = true"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import LearnedKindMark from "@/components/sessions/LearnedKindMark.vue";
import LearnedSessionSelect from "@/components/sessions/LearnedSessionSelect.vue";
import SessionLearnedAdd from "@/components/sessions/SessionLearnedAdd.vue";
import { useMoveLearned, useSessionLearned } from "@/composables/sessions/useSessionLearned";
import { useToast } from "@/composables/useToast";
import { LEARNED_KINDS, learnedEntryLink, type LearnedEntry } from "@/lib/sessions/learned";

/**
 * "What the party learned" for one session (#985): everything shared or
 * discovered while it was open, a way to move a moment to the session it
 * really belonged to, and a way to share what the DM forgot and file it here.
 */
const { sessionId } = defineProps<{ sessionId: string }>();

const { entries, isLoading, error } = useSessionLearned(() => sessionId);
const move = useMoveLearned();
const toast = useToast();

const moving = ref<string | null>(null);
const adding = ref(false);

const blocks = computed(() =>
  LEARNED_KINDS.map(({ kind, label }) => ({ kind, label, entries: entries.value.filter((e) => e.kind === kind) })).filter(
    (b) => b.entries.length > 0,
  ),
);

async function moveEntry(entry: LearnedEntry, target: string | null | undefined) {
  if (target === undefined) return;
  try {
    await move.mutateAsync({ entries: [entry], sessionId: target });
    moving.value = null;
  } catch (e) {
    toast.error(toast.fromError(e, "Could not move that to another session."));
  }
}
</script>
