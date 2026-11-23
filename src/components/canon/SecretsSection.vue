<template>
  <section id="canon-secrets" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-secrets-heading">
    <CanonRubric id="canon-secrets-heading" numeral="IV" title="Secrets and questions" />

    <ul v-if="secrets.length > 0" class="flex flex-col border border-border bg-card" data-testid="secret-ledger">
      <SecretRow
        v-for="secret in secrets"
        :key="secret.id"
        :entry="secret"
        :clues="cluesOf(secret.id)"
        :selected="secret.id === selectedId"
        @select="emit('select', secret.id)"
      />
    </ul>
    <EmptyState
      v-else
      class="border border-dashed border-border bg-card"
      title="No secrets yet"
      description="A secret is something the world is keeping back. Give it clues the party can find, and reveal it when they have."
    />

    <CanonAddRow placeholder="A new secret, as one statement…" input-label="A new secret" label="Add secret" :create="addSecret" />

    <!-- Below a desktop the open secret's detail opens here, right under the ledger, not past the open questions. -->
    <slot />

    <QuestionsList :questions="questions" class="mt-4" />
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
import CanonRubric from "./CanonRubric.vue";
import QuestionsList from "./QuestionsList.vue";
import SecretRow from "./SecretRow.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { secrets, questions, selectedId = null } = defineProps<{
  secrets: readonly CanonEntry[];
  questions: readonly CanonEntry[];
  selectedId?: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

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
