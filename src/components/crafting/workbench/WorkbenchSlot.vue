<template>
  <!--
    A raw button on purpose: a slot is an illustrated object (a dish with its material), not a
    control recipe, so AppButton's chrome would be wrong. The visible focus ring is an ink ring
    with a paper gap, which reads on dark wood and on paper alike.
  -->
  <button
    ref="el"
    type="button"
    class="wb-slot group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    :class="variant === 'bench' ? 'flex w-(--dish-w) flex-col items-center gap-2 rounded-md' : 'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-2 text-foreground'"
    :aria-label="label"
    aria-haspopup="dialog"
    @click="onOpen"
  >
    <!-- Phone rows stand the dish on the lower part of the bench picture. -->
    <span
      v-if="variant === 'row'"
      class="wb-well relative flex shrink-0 items-end justify-center overflow-hidden rounded-md"
      :style="{ '--dish-w': '5.5rem', backgroundImage: `url(${art.phoneSrc})` }"
    >
      <WorkbenchDish v-bind="dishProps" class="mb-1" />
    </span>
    <WorkbenchDish v-else v-bind="dishProps" />

    <span
      class="min-w-0"
      :class="variant === 'bench' ? 'w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground shadow-md' : 'flex-1'"
    >
      <span class="flex items-center gap-1.5 text-eyebrow" :class="stateTone">
        <component :is="stateIcon" class="h-3.5 w-3.5 shrink-0" />
        {{ SLOT_STATE_WORD[state] }}
        <span v-if="slot.index === 0" class="ml-auto text-muted-foreground">Primary</span>
      </span>
      <span class="mt-0.5 block truncate text-label-lg font-semibold text-foreground">{{ displayName }}</span>
      <span v-if="requirementLine" class="block truncate text-caption text-muted-foreground">{{ requirementLine }}</span>
      <span class="block truncate text-caption text-muted-foreground">{{ countLine }}</span>
    </span>

    <IconChevronRight v-if="variant === 'row'" class="h-4 w-4 shrink-0 text-muted-foreground" />
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import WorkbenchDish from "@/components/crafting/workbench/WorkbenchDish.vue";
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

function onOpen() {
  if (el.value) emit("open", el.value);
}

const el = ref<HTMLButtonElement | null>(null);
defineExpose({ focus: () => el.value?.focus() });

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

<style scoped>
.wb-well {
  width: 6.5rem;
  aspect-ratio: 1 / 0.8;
  /* Zoomed so only the bench top fills the well: with `cover` a 3:2 picture in a near-square box
     shows its whole height, apparatus and all. */
  background-size: 260% auto;
  background-position: center 88%;
}
</style>
