<template>
  <section id="canon-secrets" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-secrets-heading">
    <CanonRubric id="canon-secrets-heading" numeral="IV" title="Secrets and questions" />

    <CanonPartFind part="secrets" noun="secret" :count="secrets.length" :arc-label="arcLabel" />

    <ul v-if="shown.length > 0" class="flex flex-col border border-border bg-card" data-testid="secret-ledger">
      <SecretRow
        v-for="secret in shown"
        :key="secret.id"
        :entry="secret"
        :clues="cluesOf(secret.id)"
        :selected="secret.id === selectedId"
        :move="canReorder ? endsOf(groupOf(secret), secret.id) : null"
        @select="emit('select', secret.id)"
        @move="(direction) => reorder(groupOf(secret), secret.id, direction)"
      />
    </ul>
    <EmptyState v-else-if="secrets.length > 0" class="border border-dashed border-border bg-card" title="No secret matches" description="Nothing here has those words in it." />
    <EmptyState
      v-else-if="arcLabel !== null"
      class="border border-dashed border-border bg-card"
      title="No secrets in this arc"
      :description="`Nothing of this part is in ${arcLabel}.`"
    />
    <EmptyState
      v-else
      class="border border-dashed border-border bg-card"
      title="No secrets yet"
      description="A secret is something the world is keeping back. Give it clues the party can find, and reveal it when they have."
    />

    <CanonAddRow placeholder="A new secret, as one statement…" input-label="A new secret" label="Add secret" :create="addSecret" />

    <!-- Below a desktop the open secret's detail opens here, right under the ledger, not past the open questions. -->
    <slot />

    <QuestionsList :questions="questions" :arc-label="arcLabel" class="mt-4" />
  </section>
</template>

<script setup lang="ts">
/**
 * Part IV (frame 05): every secret with its state and how many clues are found, and the open questions beside them.
 * The clues are read once for the whole list, never one per secret.
 */
import { computed } from "vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonPartFind from "./CanonPartFind.vue";
import CanonRubric from "./CanonRubric.vue";
import QuestionsList from "./QuestionsList.vue";
import SecretRow from "./SecretRow.vue";
import { revealedLast } from "@/lib/canon/canonSecrets";
import { matchesQuery } from "@/lib/canon/canonNarrow";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { secrets, questions, selectedId = null, arcLabel = null } = defineProps<{
  /** The secrets and questions of the page's arc (all of them when none is chosen). */
  secrets: readonly CanonEntry[];
  questions: readonly CanonEntry[];
  selectedId?: string | null;
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

// What is still to find reads first; a revealed secret settles to the end.
const ordered = computed(() => revealedLast(secrets));

const store = useCanonUiStore();
const shown = computed(() => ordered.value.filter((s) => matchesQuery(s.title, store.partQuery.secrets)));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.partQuery.secrets.trim() === "");
const reorder = useCanonReorder();
// A secret moves among those in its own state: the ledger draws the revealed after the rest whatever their order.
const groupOf = (secret: CanonEntry) => ordered.value.filter((s) => (s.revealed_at === null) === (secret.revealed_at === null));

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
