<template>
  <div class="flex flex-col gap-4 pb-4">
    <section v-for="r in rows" :key="r.index" class="flex flex-col gap-1.5" :class="r.hasFocus ? 'kin-focus-row -mx-4 px-4 py-2' : ''">
      <h3 class="text-label uppercase tracking-wider" :class="r.hasFocus ? 'text-destructive' : 'text-muted-foreground'">{{ r.label }}</h3>
      <div class="flex snap-x snap-proximity gap-2 overflow-x-auto pb-1" role="list">
        <template v-for="c in r.cards" :key="c.id">
          <div v-if="c.foldOf !== null" role="listitem" class="shrink-0 snap-start">
            <AppButton
              variant="subtle"
              size="sm"
              class="border-dashed"
              :label="countLabel(c.foldCount)"
              @click="emit('unfold', c.foldOf)"
            />
          </div>
          <div v-else-if="c.view" role="listitem" class="w-40 shrink-0 snap-start">
            <KinCard
              class="w-full"
              :person="c.view"
              compact
              :focus="c.view.key === focus"
              :married-in="marriedIn?.has(c.view.key)"
              :rank="succession?.get(c.view.key) ?? null"
              :dimmed="dimmed?.has(c.view.key)"
              @click="emit('select', c.view.key)"
            />
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/** Frame 07b: one generation per row, each row swiping sideways, the centred person's row tinted. No lines. */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KinCard from "@/components/kinship/KinCard.vue";
import type { KinPersonView } from "@/composables/kinship/useKinGraph";
import type { PlacedCard, TreeLayout } from "@/lib/kinship/layout";
import type { PersonKey } from "@/types/kinship.types";
import { inReadingOrder } from "./treeGeometry";

const { layout, people, focus = null, marriedIn, succession, dimmed } = defineProps<{
  layout: TreeLayout;
  people: Map<PersonKey, KinPersonView>;
  focus?: PersonKey | null;
  marriedIn?: Set<PersonKey>;
  succession?: Map<PersonKey, number>;
  dimmed?: Set<PersonKey>;
}>();
const emit = defineEmits<{ select: [key: PersonKey]; unfold: [parent: PersonKey] }>();

type Slot = PlacedCard & { view: KinPersonView | null };

const countLabel = (n: number): string => (n === 1 ? "1 child" : `${n} children`);

const rows = computed(() => {
  const ordered = inReadingOrder(layout.cards);
  const byRow = new Map<number, Slot[]>();
  for (const c of ordered) {
    const view = c.person !== null ? (people.get(c.person) ?? null) : null;
    byRow.set(c.row, [...(byRow.get(c.row) ?? []), { ...c, view }]);
  }
  const focusRow = layout.cards.find((c) => c.person !== null && c.person === focus)?.row ?? 0;
  return [...byRow.entries()].map(([index, cards]) => {
    const name = focus ? (people.get(focus)?.name ?? "") : "";
    const rel = index - focusRow;
    const base =
      rel === 0 ? `${name ? `${name}'s` : "This"} generation` : rel === -1 ? "Parents" : rel === -2 ? "Grandparents" : rel < 0 ? "Ancestors" : rel === 1 ? "Children" : "Descendants";
    const year = layout.rowBornYear[index] ?? null;
    return {
      index,
      cards,
      hasFocus: index === focusRow && focus !== null,
      label: year !== null ? `${base}, c. ${year}` : base,
    };
  });
});
</script>

<style scoped>
.kin-focus-row {
  background: color-mix(in oklab, var(--live-ink, var(--color-destructive)) 7%, transparent);
}
</style>
