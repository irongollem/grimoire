<template>
  <ListPageLayout
    title="Sort Out Family Links"
    description="Links from before family trees just say “Family”. Say once which way each one goes."
  >
    <template #actions>
      <ListActionButton :icon="IconChevronLeft" label="NPCs" to="/npcs" />
    </template>

    <ListSkeleton v-if="source.isLoading.value" variant="rows" :count="6" />

    <EmptyState
      v-else-if="rows.length === 0"
      title="Every family link is sorted."
      description="New relatives are added from an NPC sheet, with the direction chosen then."
    >
      <template #action>
        <AppButton variant="primary" to="/npcs">Back to the NPCs</AppButton>
      </template>
    </EmptyState>

    <section v-else class="torn flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:p-6">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 class="flex-1 text-heading font-semibold">Linked as “Family”</h2>
        <span class="text-caption italic text-muted-foreground">
          {{ suggestedCount }} {{ suggestedCount === 1 ? "has" : "have" }} a suggestion from birth years or notes
        </span>
        <AppButton v-if="suggestedCount > 0" size="sm" @click="acceptAll">
          Accept all {{ suggestedCount }} suggestions
        </AppButton>
      </div>

      <div class="hidden gap-x-4 border-b border-border pb-1.5 text-eyebrow text-muted-foreground md:grid md:grid-cols-[14rem_14rem_minmax(0,1fr)]">
        <span>Linked as “Family”</span>
        <span>Why we think so</span>
        <span>They are…</span>
      </div>

      <SortFamilyLinksRow
        v-for="row in rows"
        :key="row.link.id"
        :row="row"
        :chosen="chosen.get(row.link.id) ?? null"
        @choose="chosen.set(row.link.id, $event)"
      />

      <div class="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <span class="min-w-0 flex-1 text-caption italic text-muted-foreground">
          {{ chosen.size }} of {{ rows.length }} chosen · anything left stays a plain relative, which you can change on
          either sheet
        </span>
        <AppButton variant="ghost" :disabled="saving" @click="leaveRest">Leave the rest as relatives</AppButton>
        <AppButton variant="primary" :disabled="chosen.size === 0" :loading="saving" @click="saveChosen">
          Save {{ chosen.size }}
        </AppButton>
      </div>
    </section>
  </ListPageLayout>
</template>

<script setup lang="ts">
/**
 * The one-off review of old "Family" links (#1083, frame 05). Rows stay in this
 * view's state until saved; picking is free, saving is explicit.
 */
import { computed, reactive, ref } from "vue";
import { IconChevronLeft } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import SortFamilyLinksRow from "@/components/kinship/SortFamilyLinksRow.vue";
import { useDmKinGraph } from "@/composables/kinship/useKinGraph";
import { useUpdateKinLink } from "@/composables/kinship/useKinLinks";
import { useToast } from "@/composables/useToast";
import { linkEnds } from "@/lib/kinship/keys";
import { buildSortRows, sortPatch } from "@/lib/kinship/sortChoices";
import type { SortChoice } from "@/lib/kinship/sortSuggestions";

const source = useDmKinGraph();
const update = useUpdateKinLink();
const toast = useToast();
const saving = ref(false);

const rows = computed(() => buildSortRows(source.links.value, linkEnds, source.people.value));
const chosen = reactive(new Map<string, SortChoice>());
const suggestedCount = computed(() => rows.value.filter((r) => r.suggestion).length);

function acceptAll() {
  for (const row of rows.value) if (row.suggestion) chosen.set(row.link.id, row.suggestion.choice);
}

async function settle(entries: { id: string; patch: ReturnType<typeof sortPatch> }[], message: string) {
  saving.value = true;
  try {
    for (const { id, patch } of entries) await update.mutateAsync({ id, patch });
    for (const { id } of entries) chosen.delete(id);
    toast.success(message);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not save those links."));
  } finally {
    saving.value = false;
  }
}

function saveChosen() {
  const entries = rows.value.flatMap((row) => {
    const choice = chosen.get(row.link.id);
    return choice ? [{ id: row.link.id, patch: sortPatch(row, choice) }] : [];
  });
  return settle(entries, `Sorted ${entries.length} family ${entries.length === 1 ? "link" : "links"}.`);
}

// Unchosen rows stay kind "relative"; only the flag clears.
function leaveRest() {
  const entries = rows.value
    .filter((row) => !chosen.has(row.link.id))
    .map((row) => ({ id: row.link.id, patch: { needs_sorting: false } }));
  return settle(entries, "The rest stay as relatives.");
}
</script>
