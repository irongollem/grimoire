<template>
  <li :id="`canon-entry-${entry.id}`" class="flex min-w-0 flex-col gap-1.5 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3" data-testid="answered-row">
    <div class="min-w-0 flex-1">
      <p class="text-body text-foreground">{{ entry.title }}</p>
      <p class="text-caption text-muted-foreground" data-testid="answered-as">
        <template v-if="entry.closed_note !== null">
          Answered:
          <RouterLink v-if="entry.became_entry_id !== null" :to="{ path: '/canon', query: { entry: entry.became_entry_id } }" class="underline">{{ entry.closed_note }}</RouterLink>
          <template v-else>{{ entry.closed_note }}</template>
        </template>
        <template v-else>Answered</template>
      </p>
    </div>
    <AppButton variant="ghost" size="sm" label="Reopen" data-testid="reopen-question" @click="emit('reopen')" />
  </li>
</template>

<script setup lang="ts">
/** An answered question: the question, its answer (a link to what it became while that entry exists) and Reopen. */
import AppButton from "@/components/common/controls/AppButton.vue";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ reopen: [] }>();
</script>
