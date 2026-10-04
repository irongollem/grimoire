<template>
  <GeneratorPanelShell
    v-model:open="ui.deityGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Deity Generator"
    concept-placeholder="A weary goddess of crossroads and second chances, worshipped by wanderers and exiles, who bargains rather than commands…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="unsaved ? 'deity' : null"
    :is-saving="isSaving"
    :error="genError"
    blank-to="/deities/new"
    blank-label="New Blank Deity"
    image-toggle-label="Generate a portrait"
    @generate="onGenerate"
    @discard="unsaved = null"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Pantheon</label>
        <EntityCombobox
          v-model="pantheonId"
          :options="pantheonOptions"
          placeholder="Any"
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Alignment</label>
          <AppSelect v-model="constraints.alignment" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="a in DEITY_ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Primary domain</label>
          <AppSelect v-model="constraints.primaryDomain" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="d in CLERIC_DOMAINS" :key="d" :value="d">{{ d }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="deities" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useCreateDeity, useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useDeityGeneration } from "@/ai/useDeityGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS } from "@/types/deity.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { mutateAsync: createDeity } = useCreateDeity();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useDeityGeneration();

// Mounted on every DM page: only fetch the pantheons and deities once the panel opens.
const panelOpen = () => ui.deityGeneratorOpen;
const { data: pantheons } = useAllPantheons(panelOpen);
const { data: deities } = useAllDeities(panelOpen);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("deities");

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("deity_generation") * textMultiplierFor(textProvider.value)),
);

const concept       = ref("");
const constraints   = reactive({ alignment: "", primaryDomain: "" });
const generateImage = ref(true);
const pantheonId    = ref("");

const pantheonOptions = computed(() =>
  (pantheons.value ?? []).map((p) => ({ id: p.id, name: p.name })),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
// A paid result whose save failed is kept (with the choices it was saved
// under) so the retry costs nothing, even after upgrading from a quota wall.
const unsaved = ref<{ result: Generated; pantheonId: string | null; alignment: string | null } | null>(null);
const isSaving = ref(false);

async function onGenerate() {
  if (unsaved.value) {
    await save(unsaved.value.result, unsaved.value.pantheonId, unsaved.value.alignment);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const pantheon = (pantheons.value ?? []).find((p) => p.id === pantheonId.value);
  const siblings = pantheon
    ? (deities.value ?? [])
        .filter((d) => d.pantheon_id === pantheon.id)
        .map((d) => ({ name: d.name, portfolio: d.portfolio }))
    : undefined;

  const result = await generate(concept.value.trim(), {
    pantheonName:    pantheon?.name,
    pantheonDeities: siblings,
    alignment:       constraints.alignment || undefined,
    primaryDomain:   constraints.primaryDomain || undefined,
    generateImage:   generateImage.value,
  });
  if (!result) return;

  await save(result, pantheon?.id ?? null, constraints.alignment || null);
}

async function save(result: Generated, pantheonIdForRow: string | null, alignment: string | null) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  isSaving.value = true;
  let deity;
  try {
    deity = await createDeity({
      name:              result.name,
      titles:            result.titles,
      alternate_names:   result.alternate_names,
      pantheon_id:       pantheonIdForRow,
      alignment:         result.alignment ?? alignment,
      symbol:            result.symbol,
      symbol_image_url:  null,
      portrait_url:      result.portrait_url,
      portrait_focal_point: result.portrait_url ? { x: 50, y: 50 } : null,
      domains:           result.domains,
      portfolio:         result.portfolio,
      description:       result.description ? toTiptapJson(result.description) : null,
      dm_notes:          result.dm_notes ? toTiptapJson(result.dm_notes) : null,
      player_visible_to: [],
      tags:              result.tags,
      ai_provenance:     result.ai_provenance ?? null,
    });
  } catch (e) {
    unsaved.value = { result, pantheonId: pantheonIdForRow, alignment };
    if (gateQuotaError(e)) return;
    toast.error(toast.fromError(e));
    return;
  } finally {
    isSaving.value = false;
  }
  unsaved.value = null;

  // Log the portrait to the Gallery, linked back to the new deity.
  if (result.portrait_url) {
    void logImageGeneration({
      kind: "deity", imageUrl: result.portrait_url, prompt: genConcept.value,
      targetId: deity.id, targetColumn: "portrait_url",
    });
  }

  completedEntityId.value = deity.id;
  ui.deityGeneratorOpen = false;
  router.push(`/deities/${deity.id}`);
}
</script>
