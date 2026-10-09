<template>
  <GeneratorPanelShell
    v-model:open="ui.trapGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Trap Generator"
    concept-placeholder="A pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…"
    :credits="effectiveCreditCost"
    :byok="fullyByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/traps/new"
    blank-label="New Blank Trap"
    image-toggle-label="Generate trap illustration"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Type</label>
          <AppSelect v-model="constraints.trap_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">CR</label>
          <AppSelect v-model="constraints.cr" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="c in CR_LIST" :key="c" :value="c">{{ c }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
    <template #extra>
      <!-- Party portrait toggle: only when image generation is on, an image provider resolves (OpenAI and Gemini both take source images), and a group portrait exists -->
      <div v-if="isAiEnabled && generateImage && imageProvider && groupPortraitUrl" class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Add party to scene</span>
        <ToggleSwitch v-model="includeParty" aria-label="Add party to scene" />
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateTrap } from "@/composables/dungeon-features/useTraps";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useTrapGeneration } from "@/ai/useTrapGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { TRAP_TYPES, CR_LIST } from "@/types/trap.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createTrap } = useCreateTrap();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useTrapGeneration();

const isAiEnabled   = computed(() => campaign.isAiEnabled);
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textCredits, textIsByok, imageProvider, imageCredits, imageIsByok } = useCampaignProviders();

// Whole generation is BYOK-covered only when every part of it is — the text
// call, and the illustration too whenever it's actually being generated.
const fullyByok = computed(() => textIsByok.value && (!generateImage.value || imageIsByok.value));

// Null while any part that will be charged has no known price yet.
const effectiveCreditCost = computed<number | null>(() => {
  let cost = textIsByok.value
    ? 0
    : textCredits(costOf("trap_generation"));
  if (cost === null) return null;
  // The illustration is a separate entity_image charge (portrait → 1.5×).
  if (generateImage.value && !imageIsByok.value) {
    const image = imageCredits(costOf("entity_image", { size: "1024x1536" }));
    if (image === null) return null;
    cost += image;
  }
  return cost;
});

const concept       = ref("");
const constraints   = reactive({ trap_type: "", cr: "" });
const generateImage = ref(true);
const includeParty  = ref(false);

async function generateAndCreate() {
  if (!requireCredits(effectiveCreditCost.value, fullyByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      trap_type:        constraints.trap_type || undefined,
      cr:               constraints.cr || undefined,
      generateImage:    generateImage.value,
      groupPortraitUrl: includeParty.value ? groupPortraitUrl.value : null,
    },
  );

  if (!result) return;

  const trap = await createTrap({
    // Scoped to the campaign it was generated for; widened from the trap's
    // own Scope control if the DM wants it everywhere.
    campaign_id:        campaign.activeCampaignId,
    name:               result.name,
    trap_type:          result.trap_type,
    // AI generation doesn't suggest a map glyph (#804) — the DM picks one in
    // the editor afterward; null renders as the generic hazard marker.
    hazard_glyph:       null,
    trigger_type:       result.trigger_type ?? null,
    description:        toTiptapJson(result.description),
    effect_description: result.effect_description ?? null,
    detection_dc:       result.detection_dc,
    disarm_dc:          result.disarm_dc,
    attack_bonus:       result.attack_bonus,
    save_type:          result.save_type,
    save_dc:            result.save_dc,
    damage_entries:     result.damage_entries,
    reset_type:         result.reset_type,
    cr:                 result.cr,
    trap_hp:            result.trap_hp,
    trap_ac:            result.trap_ac,
    damage_immunities:  [],
    notes:              toTiptapJson(result.notes),
    tags:               result.tags,
    image_url:          result.image_url,
    image_focal_point:  null,
    ai_provenance:      result.ai_provenance ?? null,
  });

  // Log the generated illustration to the Gallery, linked back to the new trap.
  if (result.image_url) {
    void logImageGeneration({
      kind: "trap", imageUrl: result.image_url, prompt: genConcept.value,
      targetId: trap.id, targetColumn: "image_url",
    });
  }

  completedEntityId.value = trap.id;
  ui.trapGeneratorOpen = false;
  router.push(`/traps/${trap.id}`);
}
</script>
