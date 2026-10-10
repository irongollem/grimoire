<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.deityGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Deity Generator"
    concept-placeholder="A weary goddess of crossroads and second chances, worshipped by wanderers and exiles, who bargains rather than commands…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'deity' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/deities/new"
    blank-label="New Blank Deity"
    image-toggle-label="Generate a portrait"
    @generate="onGenerate"
    @discard="retained.clear()"
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
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useToast } from "@/composables/useToast";
import { useCreateDeity, useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useDeityGeneration } from "@/ai/useDeityGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { useCreateEntityNote } from "@/composables/notes/useEntityNotes";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS } from "@/types/deity.types";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const toast = useToast();
const { mutateAsync: createDeity } = useCreateDeity();
const { mutateAsync: createNote } = useCreateEntityNote();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useDeityGeneration();

// Mounted on every DM page: only fetch the pantheons and deities once the panel opens.
const panelOpen = () => generatorsUi.deityGeneratorOpen;
const { data: pantheons } = useAllPantheons(panelOpen);
const { data: deities } = useAllDeities(panelOpen);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("deities");

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("deity_generation")),
);

const concept       = ref("");
const constraints   = reactive({ alignment: "", primaryDomain: "" });
const generateImage = ref(true);
const pantheonId    = ref("");

const pantheonOptions = computed(() =>
  (pantheons.value ?? []).map((p) => ({ id: p.id, name: p.name })),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
// The result is kept with the choices it was generated under, so a retry
// after the form changed (or after upgrading from a quota wall) saves where
// it was meant to.
interface DeityDraft { result: Generated; pantheonId: string | null; alignment: string | null }
const retained = useRetainedGeneration<DeityDraft>();

async function onGenerate() {
  if (retained.unsaved.value) {
    await save(retained.unsaved.value);
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

  await save({ result, pantheonId: pantheon?.id ?? null, alignment: constraints.alignment || null });
}

async function save(draft: DeityDraft) {
  const { result } = draft;
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const deity = await retained.run(draft, async (d) => {
    let created: Awaited<ReturnType<typeof createDeity>>;
    try {
      created = await createDeity({
        name:              d.result.name,
        titles:            d.result.titles,
        alternate_names:   d.result.alternate_names,
        pantheon_id:       d.pantheonId,
        alignment:         d.result.alignment ?? d.alignment,
        symbol:            d.result.symbol,
        symbol_image_url:  null,
        portrait_url:      d.result.portrait_url,
        portrait_focal_point: d.result.portrait_url ? { x: 50, y: 50 } : null,
        domains:           d.result.domains,
        portfolio:         d.result.portfolio,
        description:       d.result.description ? toTiptapJson(d.result.description) : null,
        player_visible_to: [],
        tags:              d.result.tags,
        ai_provenance:     d.result.ai_provenance ?? null,
      });
    } catch (e) {
      if (!gateQuotaError(e)) toast.error(toast.fromError(e));
      return null;
    }
    // Deity DM notes live in the DM's private entity note, not a column. The
    // deity exists by now, so a failed note write must not make a retry create
    // a second deity: report it and carry on.
    const secrets = d.result.dm_notes?.trim();
    if (secrets) {
      try {
        await createNote({
          entity_type: "deity",
          entity_id: created.id,
          content: toTiptapJson(secrets),
          is_private: true,
          shared_with_dm: false,
          campaign_id: created.campaign_id,
        });
      } catch (e) {
        toast.error(`The deity was created, but its DM notes were not saved. ${toast.fromError(e)}`);
      }
    }
    return created;
  });
  if (!deity) return;

  // Log the portrait to the Gallery, linked back to the new deity.
  if (result.portrait_url) {
    void logImageGeneration({
      kind: "deity", imageUrl: result.portrait_url, prompt: genConcept.value,
      targetId: deity.id, targetColumn: "portrait_url",
    });
  }

  completedEntityId.value = deity.id;
  generatorsUi.deityGeneratorOpen = false;
  router.push(`/deities/${deity.id}`);
}
</script>
