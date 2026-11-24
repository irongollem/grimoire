<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.deityGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Deity Generator"
    concept-placeholder="A weary goddess of crossroads and second chances, worshipped by wanderers and exiles, who bargains rather than commands…"
    :credits="textCreditCost"
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
      <!-- Every other tie (a faction that serves them, a holy place, a relic) has no field of its own above. -->
      <GeneratorLinksField v-model="links" subject-kind="deity" noun="this deity" />
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="deities" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useToast } from "@/composables/useToast";
import { useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import GeneratorLinksField from "@/components/generators/GeneratorLinksField.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useDeityQuote } from "@/composables/ai/quotes/deityQuote";
import { useGenerateDeity, type DeityDraft } from "@/composables/deities/useGenerateDeity";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS } from "@/types/deity.types";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const toast = useToast();
const { generation, generateDeityDraft, saveDeity } = useGenerateDeity();
const { isGenerating, error: genError, completedEntityId, concept: genConcept } = generation;

// Mounted on every DM page: only fetch the pantheons and deities once the panel opens.
const panelOpen = () => generatorsUi.deityGeneratorOpen;
const { data: pantheons } = useAllPantheons(panelOpen);
const { data: deities } = useAllDeities(panelOpen);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("deities");

// The price comes from the quote Ask Grimoire reads too, so the page and the panel cannot disagree.
const quote = useDeityQuote();
const textCreditCost = computed(() => quote({ image: false }).total);

const concept       = ref("");
const constraints   = reactive({ alignment: "", primaryDomain: "" });
const generateImage = ref(true);
const pantheonId    = ref("");
const links         = ref<GeneratorLink[]>([]);

const pantheonOptions = computed(() =>
  (pantheons.value ?? []).map((p) => ({ id: p.id, name: p.name })),
);

// The result is kept with the choices it was generated under, so a retry
// after the form changed (or after upgrading from a quota wall) saves where
// it was meant to.
const retained = useRetainedGeneration<DeityDraft>();

async function onGenerate() {
  if (retained.unsaved.value) {
    await save(retained.unsaved.value);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value)) return;

  const pantheon = (pantheons.value ?? []).find((p) => p.id === pantheonId.value);
  const draft = await generateDeityDraft(concept.value.trim(), {
    pantheon,
    deities: deities.value,
    alignment: constraints.alignment || undefined,
    primaryDomain: constraints.primaryDomain || undefined,
    generateImage: generateImage.value,
    links: links.value,
  });
  if (!draft) return;

  await save(draft);
}

async function save(draft: DeityDraft) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const deity = await retained.run(draft, async (d) => {
    try {
      const saved = await saveDeity(d, genConcept.value);
      // The deity exists by now, so a failed note write must not make a retry
      // create a second deity: report it and carry on.
      if (saved.notesFailure) {
        toast.error(`The deity was created, but its DM notes were not saved. ${toast.fromError(saved.notesFailure)}`);
      }
      // The same for a tie that did not write: the deity is there, and a retry must not make a second one.
      if (saved.linkErrors.length) {
        toast.error(`The deity was created, but some connections could not be added: ${saved.linkErrors.join("; ")}`);
      }
      return saved;
    } catch (e) {
      if (!gateQuotaError(e)) toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!deity) return;

  completedEntityId.value = deity.id;
  generatorsUi.deityGeneratorOpen = false;
  router.push(`/deities/${deity.id}`);
}
</script>
