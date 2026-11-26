<template>
  <section v-if="clues.length > 0 || passages.length > 0" class="flex flex-col" :class="[bare ? 'gap-3' : 'border border-border bg-card', !bare && (compact ? 'gap-2 p-2' : 'gap-3 p-3')]" aria-label="Canon here" :data-compact="compact || undefined" data-testid="canon-here">
    <div v-if="clues.length > 0" class="flex flex-col gap-2" data-testid="clues-here">
      <span class="text-eyebrow text-muted-foreground">Clues here</span>
      <ul class="flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
        <li v-for="clue in clues" :key="clue.id" class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3" data-testid="clue-here">
          <span class="min-w-0 flex-1">
            <span class="block text-body leading-snug text-foreground">{{ clue.title }}</span>
            <RouterLink
              v-if="clue.secret_title"
              :to="{ path: '/canon', query: { entry: clue.secret_id } }"
              class="text-label text-muted-foreground underline-offset-2 hover:underline"
            >
              Clue to: {{ clue.secret_title }}
            </RouterLink>
          </span>
          <AppCheckbox :model-value="clue.found_at !== null" label="Found" label-role="label" @update:model-value="(v: boolean) => setFound(clue, v)" />
        </li>
      </ul>
    </div>

    <div v-if="passages.length > 0" class="flex flex-col gap-2" data-testid="lore-here">
      <span class="text-eyebrow text-muted-foreground">Lore to tell here</span>
      <ul class="flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
        <li v-for="p in passages" :key="p.id" class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3" data-testid="passage-here">
          <span class="min-w-0 flex-1">
            <span class="block text-body leading-snug text-foreground">{{ p.title || "An untitled passage" }}</span>
            <RouterLink
              v-if="p.entry_title"
              :to="{ path: '/canon', query: { entry: p.entry_id } }"
              class="text-label text-muted-foreground underline-offset-2 hover:underline"
            >
              From: {{ p.entry_title }}
            </RouterLink>
          </span>
          <AppButton variant="primary" size="sm" label="Tell the party" data-testid="tell-here" @click="tell(p)" />
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * What the canon placed at this place, person or beat (#1226, frames 05 and 04b), for the DM at the table: the clues
 * that lie here with the secret each points at and the Found tick, and the lore passages that come out here and are
 * not yet told, each with Tell the party. DM pages only: a player surface never mounts it. Nothing renders when
 * nothing is placed here.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useSetClueFound, type ClueKind } from "@/composables/canon/useCanonClues";
import { useCanonHere } from "@/composables/canon/useCanonHere";
import { useTellPassage } from "@/composables/canon/useCanonPassageEdits";

/**
 * `compact` is the run surfaces' version (the quest cockpit, the Play screen): tighter, for a column that already carries a lot.
 * `bare` drops the card, for a host that draws its own (an NPC's "In the canon" block, which holds this as one of its groups).
 */
const { kind, id, compact = false, bare = false } = defineProps<{ kind: ClueKind; id: string; compact?: boolean; bare?: boolean }>();

// One read for the block (get_canon_here), not the campaign's clues, entries and passages.
const { data: here } = useCanonHere(() => kind, () => id);
const clues = computed(() => here.value?.clues ?? []);
const passages = computed(() => here.value?.passages ?? []);
const setFound = useSetClueFound();
const { tell } = useTellPassage();
</script>
