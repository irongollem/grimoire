<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.customSubclassGeneratorOpen"
    v-model:concept="concept"
    title="Archetype Generator"
    concept-placeholder="Smiths who forge their own armour from the embers of fallen comrades, growing stronger with every name they carry…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    :can-generate="!!parentClass && !pending && !creating"
    blank-to="/levelup/custom/new"
    blank-label="New Blank Archetype"
    @generate="generateSubclass"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Parent class (required)</label>
        <EntityCombobox
          v-model="parentClassName"
          :options="classOptions"
          placeholder="Pick the class this belongs to"
        />
      </div>
    </template>

    <template #extra>
      <div
        v-if="pending"
        class="rounded-md border border-primary/30 bg-muted/40 px-3 py-3 space-y-3"
        data-testid="subclass-confirm"
      >
        <p class="text-label-lg font-semibold text-muted-foreground">THIS WILL CREATE</p>
        <ul class="space-y-2 text-body text-foreground">
          <li>
            <span class="font-semibold">Archetype: {{ pending.base.subclass_name }}</span>
            <span class="block text-caption text-muted-foreground">
              A {{ pending.base.class_name }} archetype
            </span>
          </li>
          <li>
            <span class="font-semibold">
              {{ pending.features.length }} {{ pending.features.length === 1 ? "ability" : "abilities" }}
            </span>
            <span class="block text-caption text-muted-foreground">at levels {{ levelSummary }}</span>
          </li>
        </ul>
        <div class="flex gap-2">
          <AppButton
            variant="primary"
            size="md"
            class="flex-1"
            label="Create"
            :loading="creating"
            :disabled="creating"
            @click="createAll"
          />
          <AppButton
            variant="outline"
            size="md"
            class="flex-1"
            label="Back"
            :disabled="creating"
            @click="pending = null"
          />
        </div>
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useToast } from "@/composables/useToast";
import { useSubclassQuote } from "@/composables/ai/quotes/subclassQuote";
import { useGenerateCustomSubclass, useSubclassParents } from "@/composables/rules/useGenerateCustomSubclass";
import type { SubclassDraft } from "@/lib/codex/subclassAi";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();

const { generation, createSubclassFromDraft } = useGenerateCustomSubclass();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = generation;

// Mounted on every DM page: fetch only once opened.
const { levelByClass: subclassLevelByClass, options: classOptions } = useSubclassParents(() => generatorsUi.customSubclassGeneratorOpen);

const { canSpend } = useGenerationGate();
// The price comes from the quote Ask Grimoire reads too, so the page and the panel cannot disagree.
const { textIsByok } = useCampaignProviders();
const quote = useSubclassQuote();
const textCreditCost = computed(() => quote().total);

const concept = ref("");
const parentClassName = ref("");
const parentClass = computed(() =>
  subclassLevelByClass.value.has(parentClassName.value) ? parentClassName.value : null,
);

const pending = ref<SubclassDraft | null>(null);
const creating = ref(false);

const levelSummary = computed(() =>
  [...new Set((pending.value?.features ?? []).map((f) => f.level))].join(", "),
);

async function generateSubclass() {
  const parent = parentClass.value;
  const subclassLevel = parent ? subclassLevelByClass.value.get(parent) : undefined;
  if (!parent || subclassLevel === undefined) return;
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  pending.value = null;

  const draft = await generate(concept.value.trim(), { parentClassName: parent, subclassLevel });
  if (!draft) return;

  // Nothing is written yet: the DM sees what will be created first.
  pending.value = draft;
}

async function createAll() {
  const draft = pending.value;
  if (!draft || creating.value) return;
  creating.value = true;
  try {
    const created = await createSubclassFromDraft(draft);
    pending.value = null;
    completedEntityId.value = created.id;
    generatorsUi.customSubclassGeneratorOpen = false;
    router.push(`/levelup/custom/${created.id}`);
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    creating.value = false;
  }
}
</script>
