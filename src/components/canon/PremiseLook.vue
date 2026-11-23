<template>
  <PremiseTextField
    ref="field"
    kind="look"
    label="Look"
    placeholder="How its pictures are painted: storybook gouache, candlelit oils…"
    help="Players never read this. Every AI picture is painted from it and from these pictures."
    :campaign-id="campaign.id"
    :entry="entry"
  >
    <div class="flex flex-col gap-2" data-testid="look-pictures">
      <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
        <li v-for="(url, i) in images" :key="url" class="relative size-20 overflow-hidden border border-border bg-muted" data-testid="look-picture">
          <img :src="url" :alt="`Look picture ${i + 1}`" class="size-full object-cover" loading="lazy" />
          <AppButton
            class="absolute right-0.5 top-0.5"
            variant="subtle"
            size="icon-xs"
            :icon="IconClose"
            :aria-label="`Remove picture ${i + 1}`"
            tooltip="Remove"
            :disabled="busy"
            @click="remove(url)"
          />
        </li>
        <li v-if="images.length < MAX_LOOK_PICTURES">
          <label
            class="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border text-caption text-muted-foreground hover:bg-muted/40"
            :class="{ 'bg-muted/40': dragging, 'pointer-events-none opacity-60': busy }"
            data-testid="look-add"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <IconAddImage class="size-5" aria-hidden="true" />
            <span>{{ busy ? "Adding…" : "Add pictures" }}</span>
            <input type="file" accept="image/*" multiple class="sr-only" data-testid="look-file" @change="onPick" />
          </label>
        </li>
      </ul>

      <div v-if="isAiEnabled && images.length > 0" class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconGenerate"
          icon-size="xs"
          label="Describe from the pictures"
          :loading="isDescribing"
          :disabled="busy || isAnyAiGenerating"
          @click="describeFromPictures"
        />
        <GenerationCostBadge :credits="cost" :byok="textIsByok" />
      </div>
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>
  </PremiseTextField>
</template>

<script setup lang="ts">
/**
 * The campaign's look (#1252): its words, and up to four pictures kept as style references for every AI picture
 * ("a look is sometimes hard to describe but easy to show"). The text saves itself in `PremiseTextField`; a picture
 * is written the moment it is added or removed, creating the look entry first if the DM has typed nothing yet.
 */
import { computed, ref, useTemplateRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import PremiseTextField from "./PremiseTextField.vue";
import { IconAddImage, IconClose, IconGenerate } from "@/lib/icons";
import { updateCanonEntry, CANON_KEY } from "@/composables/canon/useCanonEntries";
import { useLookReferences, MAX_LOOK_PICTURES } from "@/composables/canon/useLookReferences";
import { useDescribeLook } from "@/composables/canon/useDescribeLook";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useQueryClient } from "@tanstack/vue-query";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry } from "@/types/canon.types";

const { campaign, entry } = defineProps<{ campaign: Campaign; entry?: CanonEntry }>();

const field = useTemplateRef<InstanceType<typeof PremiseTextField>>("field");
const qc = useQueryClient();
const { confirm } = useConfirm();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const dragging = ref(false);

const { images, busy, add, remove } = useLookReferences(
  () => entry?.reference_images ?? [],
  async (urls) => {
    if (!field.value) throw new Error("The look is not ready yet.");
    const id = await field.value.ensureEntry();
    await updateCanonEntry(id, { reference_images: urls });
    await qc.invalidateQueries({ queryKey: [CANON_KEY] });
  },
);

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  void add([...(input.files ?? [])]);
  input.value = "";
}
function onDrop(event: DragEvent) {
  dragging.value = false;
  void add([...(event.dataTransfer?.files ?? [])]);
}

const { describe, isDescribing, error } = useDescribeLook();
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const cost = computed(() => textCredits(costOf("canon_look_description")));

async function describeFromPictures() {
  if (!canSpend(cost.value, textIsByok.value)) return;
  const old = field.value?.text() ?? "";
  const look = await describe(campaign.id, images.value, old);
  if (look === null) return;
  if (old.trim() !== "") {
    const ok = await confirm(`This will replace “${old.trim()}” with “${look}”; are you sure?`, {
      title: "Replace the look?",
      confirmLabel: "Replace",
      danger: false,
    });
    if (!ok) return;
  }
  field.value?.setText(look);
}
</script>
