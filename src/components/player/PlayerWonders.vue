<template>
  <section aria-labelledby="world-wonders" class="space-y-2" data-testid="player-wonders">
    <h2 id="world-wonders" class="text-label text-muted-foreground">Things we wonder</h2>
    <ul v-if="wonders.length > 0" class="rounded-lg border border-border bg-card divide-y divide-border">
      <li v-for="wonder in wonders" :key="wonder.id" class="px-4 py-3">
        <p class="text-body text-foreground">{{ wonder.body }}</p>
        <p v-if="wonder.adopted_entry_id !== null" class="text-caption text-muted-foreground/70 italic mt-0.5" data-testid="wonder-adopted">Taken up by the DM</p>
        <p v-else-if="wonder.dismissed_at !== null" class="text-caption text-muted-foreground/70 italic mt-0.5" data-testid="wonder-let-be">Let be</p>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground italic">Nothing asked yet. Ask what your character would want to know.</p>
    <CanonAddRow
      v-if="!readOnly"
      placeholder="Something you wonder about the world…"
      input-label="Something you wonder"
      label="Ask"
      :create="ask"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * "Things we wonder" on the player's World tab (#1258 item 24): the player's own questions about the world, with an add
 * field. The DM answers each by taking it up as an open question or letting it be; the row says which. A DM looking
 * through a player's eyes reads, and does not ask on their behalf.
 */
import { computed } from "vue";
import CanonAddRow from "@/components/canon/CanonAddRow.vue";
import { useAddWonder, usePlayerWonders } from "@/composables/canon/useCanonWonders";
import { useAppUiStore } from "@/stores/ui/app";

const appUi = useAppUiStore();
const readOnly = computed(() => appUi.dmPreviewMode);
const { data } = usePlayerWonders();
const wonders = computed(() => data.value ?? []);
const { mutateAsync: add } = useAddWonder();

async function ask(body: string) {
  await add(body);
}
</script>
