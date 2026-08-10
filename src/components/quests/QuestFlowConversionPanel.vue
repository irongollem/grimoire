<template>
  <section class="mx-auto w-full max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="flow-conversion-heading">
    <div>
      <p class="text-label font-bold uppercase tracking-wider text-primary">Legacy quest → story flow</p>
      <h2 id="flow-conversion-heading" class="font-cinzel text-lg font-bold text-foreground">Preview the conversion</h2>
      <p class="mt-1 text-body text-muted-foreground">Nothing changes until you confirm. The legacy quest sheet remains authoritative and available.</p>
    </div>

    <LoadingSpinner v-if="previewQuery.isLoading.value" class="mx-auto my-8" />
    <p v-else-if="previewQuery.error.value" role="alert" class="text-body text-destructive">The conversion preview could not be loaded.</p>
    <template v-else-if="preview">
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-background p-3">
          <p class="font-cinzel text-sm font-bold text-foreground">{{ preview.encounter_beats_to_create }} combat beat{{ preview.encounter_beats_to_create === 1 ? '' : 's' }}</p>
          <p class="text-caption text-muted-foreground">One per existing encounter reference, placed unconnected in a staging area.</p>
        </div>
        <label class="flex gap-3 rounded-lg border border-border bg-background p-3" :class="!preview.overview_available && 'opacity-60'">
          <input v-model="includeOverview" type="checkbox" :disabled="!preview.overview_available" class="mt-1" />
          <span>
            <span class="block font-cinzel text-sm font-bold text-foreground">Optional overview beat</span>
            <span class="block text-caption text-muted-foreground">Hidden discovery beat using the existing summary or description.</span>
          </span>
        </label>
      </div>

      <div class="rounded-lg border border-border p-3 text-caption text-muted-foreground">
        <p class="font-semibold text-foreground">Preserved without rewriting</p>
        <p>{{ preview.objectives_preserved }} objectives · {{ preview.triggers_preserved }} triggers · {{ preview.subquests_preserved }} subquests · {{ preview.shared_characters_preserved }} shared characters<span v-if="preview.rewards_preserved"> · rewards</span></p>
      </div>

      <p class="rounded-md border border-tone-caution/40 bg-tone-caution/5 p-3 text-caption text-tone-caution">
        No route is inferred from reference order, timestamps, objectives, or arrays. You connect the staged beats yourself in Build mode.
      </p>
    </template>

    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
    <div class="flex flex-wrap justify-end gap-2">
      <AppButton label="Keep legacy quest" variant="subtle" :disabled="converting" @click="emit('cancel')" />
      <AppButton label="Create story flow" :disabled="!preview || converting" @click="convert" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useConvertQuestToFlow, useQuestFlowConversionPreview } from "@/composables/useQuestFlow";
import type { Quest } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const props = defineProps<{ quest: Quest }>();
const emit = defineEmits<{ converted: []; cancel: [] }>();
const enabled = computed(() => true);
const previewQuery = useQuestFlowConversionPreview(computed(() => props.quest.id), enabled);
const preview = computed(() => previewQuery.data.value ?? null);
const includeOverview = ref(true);
const error = ref("");
const mutation = useConvertQuestToFlow();
const converting = computed(() => mutation.isPending.value);

async function convert() {
  error.value = "";
  try {
    await mutation.mutateAsync({ questId: props.quest.id, includeOverview: includeOverview.value });
    emit("converted");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Conversion failed";
  }
}
</script>
