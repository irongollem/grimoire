<template>
  <!-- What the bench made of it, written out. Nothing is ever spent, so every answer ends at the bench. -->
  <AppModal :open="open" size="sm" align="sheet" :labelled-by="titleId" :backdrop-dismiss="false" @close="emit('close')">
    <div class="flex flex-col items-center gap-4 overflow-y-auto p-6 text-center">
      <p class="text-eyebrow text-muted-foreground">{{ discipline.label }}</p>

      <template v-if="result.result === 'match'">
        <h2 :id="titleId" class="text-title font-bold text-foreground">You recognise it</h2>
        <p class="text-display font-bold text-primary">{{ result.name }}</p>
        <p class="text-body text-foreground">Added to your recipes. Your DM sees that you found it.</p>
        <p v-if="chatNotice" class="text-caption text-muted-foreground">{{ chatNotice }}</p>
        <div class="flex w-full flex-col gap-2">
          <AppButton variant="primary" size="md" block label="Attempt it now" @click="emit('attempt', result.recipeId)" />
          <AppButton variant="ghost" size="md" block label="Keep experimenting" @click="emit('close')" />
        </div>
      </template>

      <template v-else>
        <h2 :id="titleId" class="text-title font-bold text-foreground">
          {{ result.result === "near" ? "You're close" : "Nothing comes of it" }}
        </h2>
        <p class="text-body text-foreground">{{ body }}</p>
        <div class="flex w-full flex-col gap-2">
          <AppButton variant="primary" size="md" block label="Keep experimenting" @click="emit('close')" />
          <template v-if="canInvent">
            <AppButton
              variant="subtle"
              size="md"
              block
              label="Ask what these could make"
              :loading="inventing"
              :disabled="inventing"
              @click="emit('invent')"
            />
            <GenerationCostBadge class="self-center" :credits="inventCost" />
          </template>
          <p v-if="inventMessage" class="text-caption text-muted-foreground" role="status">{{ inventMessage }}</p>
        </div>
      </template>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import type { DisciplineConfig } from "@/lib/crafting/disciplines";
import type { ExperimentResult } from "@/lib/crafting/experiment";

const { result, canInvent = false, inventing = false, inventCost = null, inventMessage = null } = defineProps<{
  open: boolean;
  result: ExperimentResult;
  discipline: Pick<DisciplineConfig, "label">;
  chatNotice: string | null;
  /** Inventing is on in this campaign and the player may ask (#1103): offered on a near miss or nothing. */
  canInvent?: boolean;
  inventing?: boolean;
  inventCost?: number | null;
  /** What came of asking: why nothing comes to mind, or why it failed. */
  inventMessage?: string | null;
}>();

const emit = defineEmits<{ close: []; attempt: [recipeId: string]; invent: [] }>();

const titleId = useId();

const body = computed(() => {
  if (result.result === "near") {
    return result.hint === "missing" ? "Something is missing." : "Something here doesn't belong.";
  }
  return "An hour passes. Nothing was used up.";
});
</script>
