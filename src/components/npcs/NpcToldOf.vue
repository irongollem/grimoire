<template>
  <section class="flex flex-col gap-2 border border-border bg-card p-3" aria-label="Told of in" data-testid="npc-told-of">
    <span class="text-eyebrow text-muted-foreground">Told of in</span>
    <ul v-if="rows.length > 0" class="flex flex-col gap-1">
      <li v-for="row in rows" :key="row.id" class="flex min-w-0 items-baseline justify-between gap-3" data-testid="npc-lore-row">
        <RouterLink :to="{ path: '/canon', query: { entry: row.id } }" class="min-w-0 text-body text-foreground underline-offset-2 hover:underline">{{ row.title || "Untitled lore" }}</RouterLink>
        <span class="shrink-0 text-label text-muted-foreground" data-testid="npc-lore-told">{{ row.told }} of {{ row.total }} told</span>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground" data-testid="npc-lore-none">No lore is about {{ name }} yet.</p>
    <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Write lore about this person" class="self-start" :loading="writing" data-testid="write-lore" @click="writeLore" />
  </section>
</template>

<script setup lang="ts">
/**
 * "Told of in" on an NPC's sheet (#1258 item 26): the lore entries about this person, each with how many of its
 * passages are told, so a past told in stages can be followed from the person. The NPC's own `backstory` field stays
 * the DM's summary and is not touched here. DM sheets only; the canon reads are the DM's.
 */
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useNpcLore } from "@/composables/canon/useNpcLore";
import { IconAdd } from "@/lib/icons";

const { npcId, name } = defineProps<{ npcId: string; name: string }>();
const { rows, writeLore, writing } = useNpcLore(() => npcId, () => name);
</script>
