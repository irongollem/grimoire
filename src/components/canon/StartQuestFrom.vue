<template>
  <div class="flex flex-col gap-2" data-testid="start-quest">
    <AppButton v-if="!choosing" variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Start a quest from this" class="self-start" :loading="starting" data-testid="start-quest-button" @click="onStart" />
    <div v-else class="flex flex-col gap-2 border border-border bg-muted/40 p-2" data-testid="start-quest-clues">
      <span class="text-eyebrow text-muted-foreground">Make a beat of each clue</span>
      <ul class="flex flex-col gap-1">
        <li v-for="clue in clues" :key="clue.id">
          <AppCheckbox :model-value="chosen.has(clue.id)" :label="clue.title" label-role="label" @update:model-value="(on: boolean) => toggle(clue.id, on)" />
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="primary" size="sm" label="Start the quest" :loading="starting" data-testid="start-quest-go" @click="go" />
        <AppButton variant="ghost" size="sm" label="Cancel" :disabled="starting" @click="choosing = false" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Start a quest from this" (#1279 item 32), on a secret and on a force. It makes a quest named for the entry, in its arc
 * and tied to it, and takes the DM to it. A secret offers its clues that lie nowhere yet as the quest's beats (all
 * ticked); with none to offer, or on a force, the first tap makes the quest.
 *
 * Landing on the new quest is a create that opens what it made, on purpose (the maintainer's Post-Mutation Navigation
 * rule sends a create back to a list, but the quest list would show nothing the DM could act on: the next thing to do
 * with a fresh quest is to build its story, and the quest has no list row to confirm it from here).
 */
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useStartQuestFrom } from "@/composables/canon/useStartQuestFrom";
import { IconAdd } from "@/lib/icons";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { entry, clues = [] } = defineProps<{
  entry: CanonEntry;
  /** The clues that lie nowhere yet, offered as beats; none on a force. */
  clues?: readonly CanonClue[];
}>();

const router = useRouter();
const { start, starting } = useStartQuestFrom(() => entry);

// Transient UI state: whether the clue list is open, and which clues are ticked (all, when it opens).
const choosing = ref(false);
const chosen = ref<ReadonlySet<string>>(new Set());

function toggle(id: string, on: boolean) {
  const next = new Set(chosen.value);
  if (on) next.add(id);
  else next.delete(id);
  chosen.value = next;
}

async function land(picked: readonly CanonClue[]) {
  const id = await start(picked);
  if (id !== null) void router.push(`/quests/${id}`);
}

async function onStart() {
  if (clues.length === 0) {
    await land([]);
    return;
  }
  chosen.value = new Set(clues.map((c) => c.id));
  choosing.value = true;
}

async function go() {
  await land(clues.filter((c) => chosen.value.has(c.id)));
}
</script>
