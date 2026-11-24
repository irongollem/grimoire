<template>
  <CanonChapter chapter="secrets" :title="chapter.label" :why="chapter.why" :open="selected !== null && store.secretsView === 'secrets'" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>
      <SegmentedControl v-model="store.secretsView" :options="VIEW_OPTIONS" class="self-start" aria-label="Show secrets or questions" data-testid="secrets-view" />
      <CanonReview v-if="store.secretsView === 'secrets'" mode="secrets" :entries="secrets" @accepted="(id) => emit('select', id)" />
    </template>

    <template v-if="store.secretsView === 'secrets'">
      <ul v-if="shown.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="secret-ledger">
        <SecretRow
          v-for="secret in shown"
          :key="secret.id"
          :entry="secret"
          :clues="cluesOf(secret.id)"
          :selected="secret.id === selected?.id"
          :move="canReorder ? endsOf(groupOf(secret), secret.id) : null"
          @select="emit('select', secret.id)"
          @move="(direction) => reorder(groupOf(secret), secret.id, direction)"
        />
      </ul>
      <CanonEmpty v-else-if="arcLabel !== null" title="No secrets in this arc" :text="`Nothing of this chapter is in ${arcLabel}.`" />
      <CanonEmpty v-else title="No secrets yet" :text="EMPTY_TEXT" ask="Suggest a secret for my canon, with clues." />
    </template>
    <QuestionsList v-else :questions="questions" :arc-label="arcLabel" />

    <template v-if="store.secretsView === 'secrets'" #add>
      <CanonAddRow placeholder="A new secret, as one statement…" input-label="A new secret" label="Add secret" :create="addSecret" />
    </template>

    <template #entry>
      <SecretDetail v-if="selected" :key="selected.id" :entry="selected" @close="emit('close')" @delete="emit('delete')" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Secrets and questions chapter: a switch between the secrets (each with its state and how many clues are found,
 * what is still to find first) and the open questions the DM keeps open on purpose. A secret opens beside the list; the
 * questions edit in their rows. The clues are read once for the whole list, never one per secret. The view chosen is
 * the store's `secretsView`, and selecting a secret from anywhere brings the page back to the secrets.
 */
import { computed, watch } from "vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonReview from "./CanonReview.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import QuestionsList from "./QuestionsList.vue";
import SecretDetail from "./SecretDetail.vue";
import SecretRow from "./SecretRow.vue";
import { chapterOf } from "@/lib/canon/canonParts";
import { revealedLast } from "@/lib/canon/canonSecrets";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonUiStore } from "@/stores/ui/canon";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const EMPTY_TEXT = "A secret is something the world keeps back. Give it clues the party can find, and reveal it when they have.";
const VIEW_OPTIONS: ReadonlyArray<{ value: "secrets" | "questions"; label: string }> = [
  { value: "secrets", label: "Secrets" },
  { value: "questions", label: "Questions" },
];

const { secrets, questions, selected = null, arcLabel = null } = defineProps<{
  /** The secrets and questions of the page's arc (all of them when none is chosen). */
  secrets: readonly CanonEntry[];
  questions: readonly CanonEntry[];
  /** The open secret, read from the whole canon so an arc change does not close it. */
  selected?: CanonEntry | null;
  /** The name of the arc narrowing this chapter, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string]; close: []; delete: [] }>();

const chapter = chapterOf("secrets");
const store = useCanonUiStore();
// A secret opened from a link or a search is on the secrets list, not behind the Questions switch.
watch(() => selected?.id, (id) => { if (id !== undefined) store.secretsView = "secrets"; }, { immediate: true });

// What is still to find reads first; a revealed secret settles to the end.
const shown = computed(() => revealedLast(secrets));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null);
const reorder = useCanonReorder();
// A secret moves among those in its own state: the ledger draws the revealed after the rest whatever their order.
const groupOf = (secret: CanonEntry) => shown.value.filter((s) => (s.revealed_at === null) === (secret.revealed_at === null));

const { data: allClues } = useCanonClues();
const bySecret = computed(() => {
  const map = new Map<string, CanonClue[]>();
  for (const clue of allClues.value ?? []) map.set(clue.secret_id, [...(map.get(clue.secret_id) ?? []), clue]);
  return map;
});
const NO_CLUES: readonly CanonClue[] = [];
const cluesOf = (id: string) => bySecret.value.get(id) ?? NO_CLUES;

const { mutateAsync: create } = useCreateCanonEntry();

async function addSecret(title: string) {
  const created = await create({ part: "secret", title, sort_order: secrets.length });
  emit("select", created.id);
}
</script>
