<template>
  <div class="flex flex-col gap-2">
    <div v-if="items.length" class="flex flex-col gap-2">
      <div v-for="row in items" :key="row.id" class="flex items-center gap-2 rounded-lg border border-border bg-card p-2" data-testid="share-row">
        <span class="min-w-0 flex-1 truncate text-body text-foreground">{{ row.name }}</span>
        <span v-if="row.tag" class="shrink-0 text-caption text-muted-foreground">{{ row.tag }}</span>
        <div class="flex shrink-0 items-center gap-1">
          <AppInput
            v-model.lazy.number="drafts[row.id]"
            type="number"
            tone="filled"
            size="body"
            align="right"
            :block="false"
            class="w-20"
            :aria-label="`Share of ${row.name}, percent`"
          />
          <span class="text-body text-muted-foreground" aria-hidden="true">%</span>
        </div>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove ${row.name}`" @click="emit('remove', row.id)" />
      </div>
    </div>
    <p v-if="items.length && !problem" class="text-caption text-muted-foreground" data-testid="share-total">
      Adds up to {{ total }}%.<template v-if="total < 100"> The other {{ rest }}% is {{ remainder }}.</template>
    </p>
    <p v-if="problem" class="text-caption text-destructive" role="alert">{{ problem }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * A list of shares of a whole, each a record's name, a percent field and remove, with the running total and the sentence
 * for what the table would refuse: the peoples of the world and what lives in a habitat, drawn once. A share saves when
 * its field is left (`set`), and not while the list has a problem the database would refuse (a total past 100), which it
 * says instead. What the shares leave over is `remainder` ("anyone else", "anything else").
 */
import { computed, reactive, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconClose } from "@/lib/icons";
import { sharesProblem, sharesRest, sharesTotal } from "@/lib/canon/shares";

export interface ShareItem {
  id: string;
  name: string;
  percent: number;
  /** A word beside the name ("species", "creature"). */
  tag?: string;
}

const { items, whole, remainder } = defineProps<{
  items: readonly ShareItem[];
  /** What the shares divide, for the sentence about a total past 100. */
  whole: string;
  remainder: string;
}>();
const emit = defineEmits<{ set: [id: string, percent: number]; remove: [id: string] }>();

// The share fields: what is typed, `null` once cleared. The server's value rules until the DM changes a field.
const drafts = reactive<Record<string, number | null>>({});
watch(() => items, (list) => {
  const ids = new Set(list.map((p) => p.id));
  for (const id of Object.keys(drafts)) if (!ids.has(id)) delete drafts[id];
  for (const p of list) drafts[p.id] = p.percent;
}, { immediate: true });

/** The list as the screen holds it: a cleared share field counts as not a number, so it is named and not saved. */
const shown = computed(() => items.map((p) => ({ name: p.name, percent: drafts[p.id] ?? Number.NaN })));
const problem = computed(() => sharesProblem(shown.value, whole));
const total = computed(() => sharesTotal(shown.value.map((p) => ({ percent: Number.isFinite(p.percent) ? p.percent : 0 }))));
const rest = computed(() => sharesRest(total.value));

// A change that would pass 100 (or is not a share) is never sent: the screen names it, and nothing is saved until it is fixed.
watch(drafts, () => {
  if (problem.value) return;
  for (const p of items) {
    const draft = drafts[p.id];
    if (typeof draft === "number" && draft !== p.percent) emit("set", p.id, draft);
  }
}, { deep: true });
</script>
