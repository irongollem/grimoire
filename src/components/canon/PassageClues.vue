<template>
  <div v-if="links.length > 0 || (canAdd && options.length > 0)" class="flex flex-col gap-1.5" data-testid="passage-clues">
    <template v-if="links.length > 0">
      <span class="text-eyebrow text-muted-foreground">Also a clue to</span>
      <span v-for="link in links" :key="link.clue.id" class="flex min-w-0 items-center gap-1">
        <RouterLink
          :to="{ path: '/canon', query: { entry: link.secret.id } }"
          class="min-w-0 flex-1 text-body underline-offset-2 hover:underline"
          data-testid="passage-clue-to"
        >{{ link.secret.title }}</RouterLink>
        <AppButton
          v-if="canAdd"
          variant="ghost"
          size="icon-sm"
          :icon="IconClose"
          :aria-label="`No longer a clue to ${link.secret.title}`"
          data-testid="passage-clue-remove"
          @click="remove(link.clue.id)"
        />
      </span>
    </template>
    <!-- Remade after each pick, so the box empties and the secret just linked is no longer offered. -->
    <EntityCombobox
      v-if="canAdd && options.length > 0"
      :key="links.length"
      v-model="picked"
      :options="options"
      placeholder="Make it a clue to a secret…"
      data-testid="passage-clue-add"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The secrets a lore passage is a clue to (#1226 frame 04b, #1255 item 5): a clue written once, as the passage itself.
 * Choosing a secret files a clue that points at the passage and lies nowhere of its own (the passage says where it
 * comes out); telling the passage finds it, in the database. Removing it deletes that clue and leaves the passage.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonClues, useCreateCanonClue, useDeleteCanonClue } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { passageClue } from "@/lib/canon/canonSecrets";
import { IconClose } from "@/lib/icons";
import type { CanonLorePassage } from "@/types/canon.types";

const { passage, canAdd = false } = defineProps<{
  passage: CanonLorePassage;
  /** False on an entry's first passage (told with the entry, never by itself) and on a player's own passage. */
  canAdd?: boolean;
}>();

const { data: clues } = useCanonClues();
const { data: entries } = useCanonEntries();
const secrets = computed(() => (entries.value ?? []).filter((e) => e.part === "secret"));

const links = computed(() =>
  (clues.value ?? []).flatMap((clue) => {
    if (clue.passage_id !== passage.id) return [];
    const secret = secrets.value.find((s) => s.id === clue.secret_id);
    return secret ? [{ clue, secret }] : [];
  }),
);

// A secret this passage is already a clue to is not offered again.
const options = computed(() => {
  const linked = new Set(links.value.map((l) => l.secret.id));
  return secrets.value.filter((s) => !linked.has(s.id)).map((s) => ({ id: s.id, name: s.title }));
});

const picked = ref("");
const { mutate: create } = useCreateCanonClue();
const { mutate: remove } = useDeleteCanonClue();

watch(picked, (secretId) => {
  if (secretId === "") return;
  create(passageClue(passage, secretId, (clues.value ?? []).filter((c) => c.secret_id === secretId).length));
  picked.value = "";
});
</script>
