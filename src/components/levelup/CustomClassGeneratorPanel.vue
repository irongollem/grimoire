<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.customClassGeneratorOpen"
    v-model:concept="concept"
    title="Class Generator"
    concept-placeholder="A warrior-priest of the Ashen Reach who tends the last forge-fires, shields allies with cinders, and burns bright at a cost to herself…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    :can-generate="!pending && !creating"
    blank-to="/levelup/classes/new"
    blank-label="New Blank Class"
    @generate="generateClass"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Hit die</label>
        <AppSelect v-model="hitDie" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="d in HIT_DICE" :key="d" :value="d">d{{ d }}</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Spellcasting</label>
        <AppSelect v-model="casterProgression" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="p in CASTER_PROGRESSIONS" :key="p" :value="p">{{ CASTER_PROGRESSION_LABELS[p] }}</option>
        </AppSelect>
      </div>
    </template>

    <template #extra>
      <div
        v-if="pending"
        class="rounded-md border border-primary/30 bg-muted/40 px-3 py-3 space-y-3"
        data-testid="class-confirm"
      >
        <p class="text-label-lg font-semibold text-muted-foreground">THIS WILL CREATE</p>
        <ul class="space-y-2 text-body text-foreground">
          <li>
            <span class="font-semibold">Class: {{ pending.base.class_name }}</span>
            <span class="block text-caption text-muted-foreground">
              d{{ pending.base.hit_die }} hit die, saves {{ pending.base.saving_throws.join(" and ") }},
              subclass at level {{ pending.base.subclass_level }}
            </span>
            <span class="block text-caption text-muted-foreground">
              {{ CASTER_PROGRESSION_LABELS[pending.progression] }}
            </span>
          </li>
          <li>
            <span class="font-semibold">
              {{ newFeatureCount }} {{ newFeatureCount === 1 ? "ability" : "abilities" }}
            </span>
            <span class="block text-caption text-muted-foreground">{{ bandSummary }}</span>
          </li>
        </ul>
        <p v-for="w in pending.warnings" :key="w" class="text-caption text-muted-foreground">{{ w }}</p>
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
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useToast } from "@/composables/useToast";
import { useCreateCustomClass } from "@/composables/rules/useCustomClasses";
import { useCreateFeature, useDeleteFeature } from "@/composables/rules/useFeatures";
import { useCustomClassGeneration } from "@/ai/useCustomClassGeneration";
import {
  CASTER_PROGRESSIONS,
  CASTER_PROGRESSION_LABELS,
  HIT_DICE,
  classWithFeatureIds,
  featureCountsByBand,
  type CasterProgression,
  type ClassDraft,
} from "@/lib/codex/classAi";
import { createWithFeatures } from "@/lib/codex/featureBatch";
import type { HitDie } from "@/levelup/customTypes";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();

const { mutateAsync: createClass } = useCreateCustomClass();
const { mutateAsync: createFeature } = useCreateFeature();
const { mutateAsync: deleteFeature } = useDeleteFeature();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useCustomClassGeneration();

const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("custom_class_generation")),
);

const concept = ref("");
const hitDie = ref<HitDie | "">("");
const casterProgression = ref<CasterProgression | "">("");

const pending = ref<ClassDraft | null>(null);
const creating = ref(false);

/** Abilities that will be created; the shared Ability Score Improvement is pointed at, not made. */
const newFeatureCount = computed(() => (pending.value?.features ?? []).filter((f) => "insert" in f).length);

const bandSummary = computed(() =>
  featureCountsByBand(pending.value?.features ?? [])
    .filter((b) => b.count > 0)
    .map((b) => `${b.label}: ${b.count}`)
    .join(", "),
);

async function generateClass() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  pending.value = null;

  const draft = await generate(concept.value.trim(), {
    hitDie: hitDie.value === "" ? undefined : Number(hitDie.value) as HitDie,
    casterProgression: casterProgression.value || undefined,
  });
  if (!draft) return;

  // Nothing is written yet: the DM sees what will be created first.
  pending.value = draft;
}

async function createAll() {
  const draft = pending.value;
  if (!draft || creating.value) return;
  creating.value = true;
  try {
    // Abilities first, then the class that points at them. A failed write
    // removes the abilities already created, so nothing is left orphaned.
    const created = await createWithFeatures(draft.features, {
      createFeature,
      deleteFeature,
      createParent: (ids) => createClass(classWithFeatureIds(draft, ids)),
    });
    pending.value = null;
    completedEntityId.value = created.id;
    generatorsUi.customClassGeneratorOpen = false;
    router.push(`/levelup/classes/${created.id}`);
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    creating.value = false;
  }
}
</script>
