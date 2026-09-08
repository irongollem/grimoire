<template>
  <!-- AI Style — Preset Picker modal -->
  <!-- No backdrop dismiss: this holds a freeform prompt and, once Generate is
       pressed, a paid render in flight. See AppModal's `backdropDismiss`. -->
  <AppModal
    :open="showPicker"
    size="md"
    labelled-by="ai-style-picker-title"
    :backdrop-dismiss="false"
    @close="$emit('closePicker')"
  >
    <!-- Scrolls for the same reason as the result panel below: the preset grid
         plus the freeform field outgrows a short viewport, and the shell caps
         the panel at the screen rather than letting it run off. -->
    <div class="overflow-y-auto px-5 pt-5 pb-3">
      <h2 id="ai-style-picker-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-1">✦ AI Map Style</h2>
      <p class="text-body text-muted-foreground mb-4">
        Re-render this map in an artistic style. The result is a new image — your tile map is unchanged.
      </p>
      <!-- Preset grid -->
      <!-- LEFT: no matching AppButton variant — a vertical tile (icon over
           label over description) rather than the primitive's horizontal
           icon+label row, and its selected state (border-amber-500/60
           bg-amber-500/10 text-amber-400) uses the documented-unsupported
           amber "coin gold" tone. -->
      <div class="grid grid-cols-3 gap-2 mb-4">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          :title="preset.description"
          :class="[
            'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors',
            selectedPresetId === preset.id
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
              : 'border-border bg-background text-muted-foreground hover:border-amber-500/30 hover:text-foreground',
          ]"
          @click="$emit('update:selectedPresetId', preset.id)"
        >
          <span class="text-lg leading-none">{{ preset.icon }}</span>
          <span class="text-label font-semibold leading-tight">{{ preset.label }}</span>
          <span class="text-caption-sm leading-tight opacity-70">{{ preset.description }}</span>
        </button>
      </div>
      <!-- Freeform suffix -->
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Additional details <span class="normal-case">(optional)</span>
      </label>
      <textarea
        :value="promptSuffix"
        rows="2"
        maxlength="300"
        placeholder="e.g. 'flooded corridors, green bioluminescent fungus, caved-in east wing'"
        class="w-full bg-background border border-border rounded-md px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:promptSuffix', ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-if="error" class="mt-2 text-caption text-destructive">{{ error }}</p>
    </div>
    <div class="flex shrink-0 justify-end items-center gap-2 px-5 pb-5 pt-2">
      <GenerationCostBadge :credits="credits" :byok="byok" class="mr-auto" />
      <AppButton
        variant="subtle"
        size="sm"
        class="px-4"
        label="Cancel"
        @click="$emit('closePicker')"
      />
      <AppButton
        variant="tinted"
        tone="caution"
        emphasis="solid"
        size="sm"
        class="px-4"
        :disabled="generating || !canAfford"
        :label="generating ? 'Generating…' : 'Generate'"
        @click="$emit('generate')"
      />
    </div>
  </AppModal>

  <!-- AI Style — Result preview modal -->
  <!--
    The styled map is a blob URL held in memory by `useMapExport` and nothing
    reopens this panel — only a fresh generation sets `showResult`. So closing
    it is the end of that render, and it cost credits: the backdrop cannot do
    it at all, and Escape or Close asks first.
  -->
  <AppModal
    :open="showResult"
    size="md"
    labelled-by="ai-style-result-title"
    :backdrop-dismiss="false"
    @close="requestCloseResult"
  >
    <!--
      The body scrolls, which the hand-rolled panel never did: a square preview
      plus header and footer is taller than a laptop viewport, and the shell
      caps the panel at the screen. Without a scroller here that cap would clip
      the footer off instead of letting the reader reach it.
    -->
    <div class="overflow-y-auto px-5 pt-5 pb-3">
      <h2 id="ai-style-result-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-3">✦ Styled Result</h2>
      <!-- Preview image -->
      <div class="mb-4 rounded-lg overflow-hidden border border-border bg-black aspect-square">
        <img
          v-if="resultUrl"
          :src="resultUrl"
          alt="AI-styled map"
          class="w-full h-full object-contain"
        />
      </div>
      <!-- Save to Atlas inline -->
      <label class="block text-eyebrow text-muted-foreground mb-1">
        Save to location
      </label>
      <EntityCombobox
        v-model="atlasLocationId"
        :options="locationOptions"
        placeholder="Search locations…"
      />
      <p v-if="atlasTargetHasMap" class="mt-2 text-caption text-amber-500">This location already has a map — saving will replace it.</p>
      <p v-if="atlasError" class="mt-2 text-caption text-destructive">{{ atlasError }}</p>
    </div>
    <div class="flex shrink-0 flex-wrap justify-between gap-2 px-5 pb-5 pt-2">
      <div class="flex gap-2">
        <AppButton variant="subtle" size="sm" label="Retry" @click="$emit('retry')" />
        <AppButton variant="subtle" size="sm" label="Back" @click="$emit('backToPicker')" />
      </div>
      <div class="flex gap-2">
        <AppButton variant="subtle" size="sm" label="↓ Download" @click="$emit('downloadStyled')" />
        <AppButton
          variant="primary"
          size="sm"
          class="px-4"
          :disabled="!atlasLocationId || atlasSaving"
          :label="atlasSaving ? 'Saving…' : 'Save to Atlas'"
          @click="$emit('saveToAtlas', atlasLocationId)"
        />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useConfirm } from "@/composables/useConfirm";

interface Preset {
  id: string;
  icon: string;
  label: string;
  description: string;
}

interface LocationOption {
  id: string;
  name: string;
}

const {
  showPicker,
  showResult,
  presets,
  selectedPresetId,
  promptSuffix,
  generating,
  error,
  resultUrl,
  locationOptions,
  atlasTargetHasMap,
  atlasError,
  atlasSaving,
  credits,
  byok,
} = defineProps<{
  showPicker: boolean;
  showResult: boolean;
  presets: Preset[];
  selectedPresetId: string;
  promptSuffix: string;
  generating: boolean;
  error: string | null;
  resultUrl: string | null;
  locationOptions: LocationOption[];
  atlasTargetHasMap: boolean;
  atlasError: string | null;
  atlasSaving: boolean;
  credits: number;
  byok: boolean;
}>();

const emit = defineEmits<{
  closePicker: [];
  closeResult: [];
  generate: [];
  retry: [];
  backToPicker: [];
  downloadStyled: [];
  saveToAtlas: [locationId: string];
  "update:selectedPresetId": [id: string];
  "update:promptSuffix": [value: string];
}>();

const { affordable } = useAiCredits();
const canAfford = computed(() => affordable(credits, byok));

const { confirm } = useConfirm();

/**
 * Escape on the result panel. Nothing reopens it and the styled map is a blob
 * URL that was never uploaded, so closing is the end of a paid render — worth
 * one question. "Back" is the labelled exit for anyone who means it.
 */
async function requestCloseResult() {
  if (
    await confirm("This styled map has not been saved or downloaded. Closing discards it, and re-rendering costs credits.", {
      title: "Discard styled map",
      confirmLabel: "Discard",
    })
  ) {
    emit("closeResult");
  }
}

const atlasLocationId = defineModel<string>("atlasLocationId", { default: "" });
</script>

