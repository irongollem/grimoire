<template>
  <div class="flex flex-col gap-2">
    <span class="text-eyebrow text-muted-foreground">{{ label }}</span>
    <ul v-if="links.length > 0" class="flex flex-wrap gap-1.5" data-testid="entry-quests">
      <li v-for="link in links" :key="link.id" class="inline-flex items-center gap-1 border border-border bg-muted/40 py-px pr-1 pl-2 text-label text-foreground">
        <RouterLink v-if="titleOf(link)" :to="`/quests/${link.quest_id}`" class="hover:underline">{{ titleOf(link) }}</RouterLink>
        <span v-else class="italic text-muted-foreground">A quest that is gone</span>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Unlink ${titleOf(link) ?? 'this quest'}`" @click="remove(link.id)" />
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground">{{ empty }}</p>
    <EntityCombobox :key="picked" v-model="picked" :options="options" placeholder="Link a quest…" />
  </div>
</template>

<script setup lang="ts">
/**
 * The quests one canon entry matters in (#1255 item 12): link one from the campaign's quests (once), unlink it, open it.
 * The same block serves a force, a secret, a truth, lore and a backstory; each says its own words.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCreateEntryQuests, useDeleteEntryQuest } from "@/composables/canon/useCanonEntryQuests";
import { useQuests } from "@/composables/quests/useQuests";
import { IconClose } from "@/lib/icons";
import type { CanonEntry, CanonEntryQuest } from "@/types/canon.types";

const { entry, links, label, empty } = defineProps<{ entry: CanonEntry; links: readonly CanonEntryQuest[]; label: string; empty: string }>();

const { data: quests } = useQuests();
const titleById = computed(() => new Map((quests.value ?? []).map((q) => [q.id, q.title])));
const titleOf = (link: CanonEntryQuest) => titleById.value.get(link.quest_id) ?? null;

// A quest already linked is not offered again: it is linked once.
const options = computed(() => {
  const linked = new Set(links.map((l) => l.quest_id));
  return (quests.value ?? []).filter((q) => !linked.has(q.id)).map((q) => ({ id: q.id, name: q.title }));
});

const picked = ref("");
const { mutate: create } = useCreateEntryQuests();
const { mutate: remove } = useDeleteEntryQuest();

watch(picked, (id) => {
  if (id === "") return;
  create([{ campaign_id: entry.campaign_id, entry_id: entry.id, quest_id: id }]);
  picked.value = "";
});
</script>
