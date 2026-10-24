<template>
  <WorkbenchDishButton
    ref="button"
    :variant="variant"
    :art="art"
    :dish-props="dishProps"
    :label="label"
    has-popup
    @press="(el) => emit('open', el)"
  >
    <span class="flex items-center gap-1.5 text-eyebrow" :class="stateTone">
      <component :is="stateIcon" class="h-3.5 w-3.5 shrink-0" />
      {{ SLOT_STATE_WORD[state] }}
      <span v-if="slot.index === 0" class="ml-auto text-muted-foreground">Primary</span>
    </span>
    <span class="mt-0.5 block truncate text-label-lg font-semibold text-foreground">{{ displayName }}</span>
    <span v-if="requirementLine" class="block truncate text-caption text-muted-foreground">{{ requirementLine }}</span>
    <span class="block truncate text-caption text-muted-foreground">{{ countLine }}</span>
    <template #trailing>
      <IconChevronRight v-if="variant === 'row'" class="h-4 w-4 shrink-0 text-muted-foreground" />
    </template>
  </WorkbenchDishButton>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import WorkbenchDishButton from "@/components/crafting/workbench/WorkbenchDishButton.vue";
import { WORKBENCH_SPRITES } from "@/data/workbenchArt";
import { IconChevronRight, IconCheckCircle, IconCloseCircle, IconMinus } from "@/lib/icons";
import type { SlotCandidate, IngredientSlot } from "@/lib/crafting/ingredients";
import { spriteSrc, type BenchArt } from "@/lib/crafting/workbench/art";
import type { ResolvedSprite } from "@/lib/crafting/workbench/materialSprite";
import { SLOT_STATE_WORD, type MaterialExit, type SlotState } from "@/lib/crafting/workbench/slotMaterial";

const { slot, total, variant, state, art, material, used, exit = null } = defineProps<{
  slot: IngredientSlot;
  /** How many ingredients the recipe has, for "Ingredient 1 of 4". */
  total: number;
  variant: "bench" | "row";
  state: SlotState;
  art: BenchArt;
  /** The sprite the dish shows when it holds something. */
  material: ResolvedSprite;
  /** The row that will be spent first; null when nothing eligible is held. */
  used: SlotCandidate | null;
  /** How the material leaves once the roll is in; null before it. */
  exit?: MaterialExit | null;
}>();

const emit = defineEmits<{ open: [el: HTMLElement] }>();

const button = ref<InstanceType<typeof WorkbenchDishButton> | null>(null);
defineExpose({ focus: () => button.value?.focus() });

const dishProps = computed(() => ({
  dishSrc: art.dishSrc,
  dish: art.dish,
  spriteSrc: spriteSrc(material.sprite),
  sprite: WORKBENCH_SPRITES[material.sprite],
  filter: material.filter,
  exit,
  order: slot.index,
  // A short dish still shows the missing outline: part of what the recipe needs is not there.
  state: state === "short" ? ("missing" as const) : state,
}));

// A tag slot reads as the item that will be spent; the requirement sits under it.
const displayName = computed(() => (slot.ref || !used ? slot.name : used.inv.name));
const requirementLine = computed(() => (!slot.ref && used ? slot.name : null));

const spentLike = computed(() => state === "spent" || state === "ruined");
const countLine = computed(() => {
  if (spentLike.value) return `Used ${slot.needed}`;
  // The tags already show as the name ("Any "leather"") or the requirement line under the item.
  return `Need ${slot.needed} · have ${slot.available}`;
});

const stateIcon = computed(() => {
  if (state === "ready") return IconCheckCircle;
  if (state === "spent") return IconMinus;
  return IconCloseCircle;
});
// Spent is never red: the ingredients were used, not lost to a fault.
const stateTone = computed(() => {
  if (state === "ready") return "text-tone-success";
  if (state === "spent") return "text-muted-foreground";
  return "text-destructive";
});

const label = computed(() => {
  const primary = slot.index === 0 ? ", primary" : "";
  const tags = slot.tags && !spentLike.value ? `, any ${slot.tags.join(", ")}` : "";
  const count = spentLike.value ? `Used ${slot.needed}` : `Need ${slot.needed}, have ${slot.available}${tags}`;
  return `Ingredient ${slot.index + 1} of ${total}${primary}: ${displayName.value}. ${SLOT_STATE_WORD[state]}. ${count}.`;
});
</script>
