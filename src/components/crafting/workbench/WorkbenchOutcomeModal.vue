<template>
  <!--
    What the roll came to, written out. It opens once the bench has played its reaction, and says
    everything the motion said, so nothing here depends on having seen it.
  -->
  <AppModal :open="open" size="sm" align="sheet" :labelled-by="titleId" @close="emit('close')">
    <div class="flex flex-col items-center gap-4 overflow-y-auto p-6 text-center">
      <template v-if="outcome === 'success'">
        <p class="text-eyebrow text-muted-foreground">{{ discipline.label }}</p>
        <h2 :id="titleId" class="text-display font-bold text-primary">{{ discipline.doneVerb }}!</h2>
        <div class="wo-frame h-36 w-48 overflow-hidden rounded-lg border-2 bg-muted">
          <FocalImage :src="recipeArt?.url ?? null" :alt="recipeName" format="landscape" :focal-point="recipeArt?.focalPoint ?? null" :placeholder="placeholderUrl('item')" />
        </div>
        <p class="text-body font-semibold text-foreground">{{ outputText }}, in your pack</p>
      </template>

      <template v-else>
        <p class="text-eyebrow text-muted-foreground">{{ discipline.label }}</p>
        <h2
          :id="titleId"
          class="flex items-center gap-2 text-title font-bold"
          :class="outcome === 'ruin' ? 'text-destructive' : 'text-foreground'"
        >
          <IconCloseCircle v-if="outcome === 'ruin'" class="h-6 w-6 shrink-0" aria-hidden="true" />
          {{ outcome === "ruin" ? "Critical failure" : "The attempt failed" }}
        </h2>

        <template v-if="outcome === 'fail'">
          <p class="text-body text-foreground">Nothing was used up. {{ timeSentence }}</p>
          <p class="text-caption text-muted-foreground">Your materials may be the worse for it; your DM can rule that with Poor ingredients.</p>
        </template>

        <section v-if="lost.length > 0" class="w-full text-left" aria-label="Lost">
          <p class="mb-1.5 text-eyebrow text-muted-foreground">Lost</p>
          <ul class="flex flex-col gap-1.5">
            <li v-for="m in lost" :key="m.name" class="flex items-center gap-3">
              <WorkbenchThumb :sprite="m.sprite" :look="outcome === 'ruin' ? 'charred' : 'faded'" />
              <span class="min-w-0 flex-1 truncate text-body text-foreground">{{ m.name }}</span>
              <span class="shrink-0 text-body text-muted-foreground">&times;{{ m.qty }}</span>
            </li>
          </ul>
        </section>

        <section v-if="outcome === 'ruin' && wreckageName" class="w-full text-left" aria-label="Returned as wreckage">
          <p class="mb-1.5 text-eyebrow text-muted-foreground">Returned as wreckage</p>
          <div class="flex items-center gap-3">
            <WorkbenchThumb :sprite="{ sprite: WORKBENCH_RUINED_SPRITE, filter: null }" look="plain" />
            <span class="min-w-0 flex-1 truncate text-body text-foreground">Ruined: {{ wreckageName }}</span>
          </div>
        </section>
        <p v-if="outcome === 'ruin'" class="text-body text-foreground">Everything else is untouched.</p>
      </template>

      <p class="text-caption text-muted-foreground">{{ rolledText }}</p>

      <div v-if="outcome === 'success'" class="flex w-full flex-col gap-2">
        <AppButton variant="primary" size="md" block label="Done" @click="onDone" />
        <AppButton variant="ghost" size="md" block label="Stay at the bench" @click="emit('close')" />
      </div>
      <div v-else class="flex w-full flex-col gap-2">
        <p v-if="!canRetry" class="text-caption text-destructive">You no longer have what this recipe needs.</p>
        <AppButton variant="primary" size="md" block label="Try again" :disabled="!canRetry" @click="emit('retry')" />
        <AppButton variant="ghost" size="md" block label="Done" @click="onDone" />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import WorkbenchThumb from "@/components/crafting/workbench/WorkbenchThumb.vue";
import { WORKBENCH_RUINED_SPRITE } from "@/data/workbenchArt";
import type { DisciplineConfig } from "@/lib/crafting/disciplines";
import { IconCloseCircle } from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { RecipeArt } from "@/lib/crafting/recipeArt";
import type { LostMaterial } from "@/lib/crafting/workbench/slotMaterial";
import type { CraftingAttemptResult } from "@/types/crafting.types";

const { open, outcome, discipline, recipeName, recipeArt, outputText, lost, wreckageName, rolledText, craftingTime, craftingTimeUnit, canRetry } = defineProps<{
  open: boolean;
  outcome: CraftingAttemptResult["outcome"];
  discipline: Pick<DisciplineConfig, "label" | "doneVerb">;
  recipeName: string;
  recipeArt: RecipeArt | null;
  /** What the recipe makes, "2× Healing Potion". */
  outputText: string;
  /** What the attempt spent. */
  lost: readonly LostMaterial[];
  /** The primary ingredient's name, which comes back ruined on a critical failure. */
  wreckageName: string | null;
  /** The roll, written out the way the ledger writes it. */
  rolledText: string;
  /** The recipe's time, which a failed attempt still costs. */
  craftingTime: number;
  craftingTimeUnit: string;
  /** Whether the player still holds what the recipe needs, so another attempt is possible. */
  canRetry: boolean;
}>();

const emit = defineEmits<{ close: []; retry: [] }>();

// "The 8 hours are spent." / "The hour is spent." — one unit reads as a noun, not "The 1 hour are".
const timeSentence = computed(() =>
  craftingTime === 1
    ? `The ${craftingTimeUnit.replace(/s$/, "")} is spent.`
    : `The ${craftingTime} ${craftingTimeUnit} are spent.`,
);

const titleId = useId();
const router = useRouter();

function onDone() {
  void router.push({ name: "play-crafting" });
}
</script>

<style scoped>
.wo-frame {
  border-color: var(--primary-fill, var(--primary));
  box-shadow: 0 0 1.25rem 0.125rem color-mix(in oklab, var(--primary-fill, var(--primary)) 35%, transparent);
}
</style>
