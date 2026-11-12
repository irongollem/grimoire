<template>
  <ul ref="listRef" class="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" :aria-label="label">
    <li v-for="choice in choices" :key="choice.id ?? '__none__'">
      <AppButton
        variant="subtle"
        size="body"
        block
        role="radio"
        :active="choice.id === modelValue"
        :aria-checked="choice.id === modelValue"
        :tabindex="choice.id === modelValue ? 0 : -1"
        class="h-auto flex-col items-stretch justify-start gap-1 whitespace-normal p-1.5 text-center"
        :data-testid="`paper-${choice.id ?? 'none'}`"
        @click="emit('update:modelValue', choice.id)"
        @keydown="onKey"
      >
        <!-- The paper at the scale it is laid at, so the swatch reads like the sheet. -->
        <span
          class="block aspect-square w-full rounded-sm border border-border bg-cover"
          :class="{ 'border-dashed bg-muted': choice.paper === null }"
          :style="choice.paper ? swatchStyle(choice.paper) : undefined"
          aria-hidden="true"
        />
        <span class="text-caption font-normal">{{ choice.name }}</span>
      </AppButton>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * The one paper picker (#1181): a radio group of the stock papers, each swatch drawn from the paper's real
 * surface. The painting's New sheet and a book's or handout's settings both use it. `allowNone` adds a first
 * choice for "no paper", which is `null`.
 */
import { computed, nextTick, useTemplateRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { artUrl } from "@/lib/assets/artUrl";
import { STOCK_PAPERS, type PaperId, type StockPaper } from "@/scriptorium/papers/papers";

const { modelValue, allowNone = false, noneLabel = "None", veiled = false, label = "Paper" } = defineProps<{
  modelValue: PaperId | null;
  /** Offer `null` as a choice (a document's "the look's own paper"). */
  allowNone?: boolean;
  noneLabel?: string;
  /** Lay each paper's white veil over its swatch, as on a page; a painting is never veiled. */
  veiled?: boolean;
  label?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [id: PaperId | null] }>();

const listRef = useTemplateRef<HTMLElement>("listRef");

const choices = computed<{ id: PaperId | null; name: string; paper: StockPaper | null }[]>(() => [
  ...(allowNone ? [{ id: null, name: noneLabel, paper: null }] : []),
  ...STOCK_PAPERS.map((paper) => ({ id: paper.id, name: paper.name, paper })),
]);

function swatchStyle(paper: StockPaper) {
  const picture = `url(${artUrl(paper.surfacePath)})`;
  const veil = veiled && paper.veil > 0 ? `linear-gradient(rgb(255 255 255 / ${paper.veil}), rgb(255 255 255 / ${paper.veil})), ` : "";
  return { backgroundImage: veil + picture, backgroundSize: `${paper.surfaceScale * 100}%` };
}

/** Arrow keys move the choice through the papers, as in any radio group; only the chosen one is a tab stop. */
function onKey(event: KeyboardEvent) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const at = choices.value.findIndex((c) => c.id === modelValue);
  const next = choices.value[(at + step + choices.value.length) % choices.value.length];
  if (!next) return;
  emit("update:modelValue", next.id);
  void nextTick(() => listRef.value?.querySelector<HTMLElement>(`[data-testid="paper-${next.id ?? "none"}"]`)?.focus());
}
</script>
