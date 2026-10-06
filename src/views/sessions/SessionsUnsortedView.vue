<template>
  <PageHeader title="Learned outside any session">
    <template #actions>
      <AppButton variant="ghost" size="sm" label="← Sessions" to="/sessions" />
    </template>
    <div class="flex flex-col gap-4 px-4 pb-6 md:px-6">
      <p class="max-w-prose font-fell italic text-muted-foreground">
        Shared before the log existed, or while no session was open. Put each one in the session where it happened;
        anything you leave stays here, and players see it under “Before the log”.
      </p>

      <p v-if="isLoading" class="text-body text-muted-foreground">Loading…</p>
      <p v-else-if="error" class="text-body text-destructive">Could not read what was learned outside a session.</p>
      <p v-else-if="!rows.length" class="font-fell italic text-muted-foreground">
        Everything the party learned belongs to a session.
      </p>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span class="text-body text-foreground">{{ picked.length }} selected</span>
          <span class="text-muted-foreground">·</span>
          <span class="text-body text-muted-foreground">Put them in</span>
          <LearnedSessionSelect v-model="bulkTarget" aria-label="Session for the selected" />
          <AppButton
            variant="primary"
            size="sm"
            label="Move"
            :disabled="picked.length === 0 || bulkTarget === undefined"
            :loading="move.isPending.value"
            @click="moveSelected"
          />
        </div>

        <ul class="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          <li v-for="row in rows" :key="row.entry.key" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
            <AppCheckbox v-model="picked" :value="row.entry.key" :aria-label="`Select ${row.entry.name}`" />
            <div class="w-40 shrink-0">
              <LearnedKindMark :kind="row.entry.kind" :label="KIND_NAME[row.entry.kind]" />
            </div>
            <div class="min-w-48 flex-1">
              <RouterLink :to="learnedEntryLink(row.entry)" class="font-semibold text-foreground hover:underline">
                {{ row.entry.name }}
              </RouterLink>
              <p v-if="row.entry.detail" class="whitespace-pre-line text-caption text-muted-foreground">
                {{ row.entry.detail }}
              </p>
            </div>
            <span class="w-44 shrink-0 text-caption text-muted-foreground">{{ row.when }}</span>
            <div class="flex shrink-0 items-center gap-2">
              <LearnedSessionSelect v-model="row.target" aria-label="Session for this one" />
              <AppButton
                variant="subtle"
                size="sm"
                label="Move"
                :disabled="row.target === undefined"
                @click="moveOne(row.entry, row.target)"
              />
            </div>
            <span v-if="row.suggestion" class="w-full pl-7 text-caption text-muted-foreground">
              Suggested: {{ row.suggestion }}
            </span>
          </li>
        </ul>
      </template>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import LearnedKindMark from "@/components/sessions/LearnedKindMark.vue";
import LearnedSessionSelect from "@/components/sessions/LearnedSessionSelect.vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useMoveLearned, useUnsortedLearned } from "@/composables/sessions/useSessionLearned";
import { useToast } from "@/composables/useToast";
import { learnedEntryLink, suggestSession, type LearnedEntry, type LearnedKind } from "@/lib/sessions/learned";
import { formatSessionDay } from "@/lib/sessions/sessionPrefill";

/**
 * Everything learned with no session (#985, "Learned outside any session"):
 * shared before the log existed, or while nothing was open. Each row carries a
 * suggested session; the DM moves rows one at a time or in bulk, and what is
 * left stays here.
 */
const KIND_NAME: Record<LearnedKind, string> = {
  person: "Person",
  place: "Place",
  handout: "Handout",
  creature: "Creature",
  quest: "Quest",
  combat: "Combat",
};

const { entries, isLoading, error } = useUnsortedLearned();
const { data: log } = useCampaignSessions();
const move = useMoveLearned();
const toast = useToast();

/** Each row's own picker, preselected with the suggestion until the DM changes it. */
const targets = reactive(new Map<string, string | null | undefined>());

const rows = computed(() =>
  entries.value.map((entry) => {
    const suggestion = suggestSession(entry.whenIso, log.value ?? []);
    return {
      entry,
      suggestion: suggestion?.label ?? null,
      when:
        formatSessionDay({ started_at: entry.whenIso, played_on: null, created_at: entry.whenIso }) +
        (entry.approximate ? ", approximate" : ""),
      get target(): string | null | undefined {
        return targets.has(entry.key) ? targets.get(entry.key) : suggestion?.sessionId;
      },
      set target(value: string | null | undefined) {
        targets.set(entry.key, value);
      },
    };
  }),
);

const picked = ref<string[]>([]);
const bulkTarget = ref<string | null | undefined>(undefined);

// A row that was moved leaves the list; its tick and its picker go with it.
watchEffect(() => {
  const keys = new Set(entries.value.map((e) => e.key));
  picked.value = picked.value.filter((k) => keys.has(k));
});

async function run(moved: LearnedEntry[], target: string | null) {
  try {
    await move.mutateAsync({ entries: moved, sessionId: target });
  } catch (e) {
    toast.error(toast.fromError(e, "Could not move those."));
  }
}

async function moveOne(entry: LearnedEntry, target: string | null | undefined) {
  if (target === undefined) return;
  await run([entry], target);
}

async function moveSelected() {
  if (bulkTarget.value === undefined) return;
  const chosen = new Set(picked.value);
  await run(
    entries.value.filter((e) => chosen.has(e.key)),
    bulkTarget.value,
  );
  picked.value = [];
}
</script>
