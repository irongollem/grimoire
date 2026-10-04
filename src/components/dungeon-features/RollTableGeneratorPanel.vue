<template>
  <GeneratorPanelShell
    v-model:open="ui.rollTableGeneratorOpen"
    v-model:concept="concept"
    title="Roll Table Generator"
    concept-placeholder="Forest road at night, bandits active in the region, levels 3–5…"
    :concept-limit="CONCEPT_LIMIT"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    :show-results="!!result"
    @generate="runGenerate"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">
          Die
          <span class="font-fell text-muted-foreground/60 ml-1">(entries cover 1–{{ dieMax }})</span>
        </label>
        <SegmentedControl v-model="die" :options="dieOptions" block />
      </div>
    </template>

    <template v-if="result" #results>
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">
          GENERATED TABLE
        </p>
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="underline underline-offset-2"
          label="Regenerate"
          @click="clearResult"
        />
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-4 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ result.name }}</h3>
          <span class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">{{ die }}</span>
        </div>
        <p v-if="result.description" class="text-caption text-muted-foreground italic">{{ result.description }}</p>

        <ul class="space-y-1.5">
          <li
            v-for="(entry, i) in result.entries"
            :key="i"
            class="flex items-start gap-2 text-caption text-foreground"
          >
            <span class="text-label text-primary font-semibold shrink-0 mt-0.5 w-8 text-right">
              {{ entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}` }}
            </span>
            <span>
              {{ entry.label }}
              <span v-if="entry.notes" class="block text-muted-foreground/70 italic">{{ entry.notes }}</span>
            </span>
          </li>
        </ul>

        <GeneratedEntityChips :entities="resolvedEntities" @navigate="goToEntity" />

        <div v-if="result.tags.length" class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="tag in result.tags"
            :key="tag"
            class="rounded-full bg-muted border border-border px-2 py-0.5 text-caption-sm text-muted-foreground"
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </template>

    <template #results-footer>
      <AppButton
        v-if="!createdTableId"
        variant="primary"
        size="md"
        block
        :disabled="creating"
        :icon="IconAdd"
        :label="creating ? 'Creating…' : 'Create Table'"
        @click="createTable"
      />
      <AppButton
        v-else
        variant="primary"
        size="md"
        block
        :icon="IconCheckCircle"
        label="View Table →"
        @click="viewCreated"
      />
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCreateRollTable } from "@/composables/dungeon-features/useRollTables";
import { useRollTableGeneration } from "@/ai/useRollTableGeneration";
import { resolveGeneratedEntities, type ResolvedEntity, ENTITY_KIND_ROUTE } from "@/ai/resolveGeneratedEntities";
import GeneratedEntityChips from "@/components/common/GeneratedEntityChips.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { ROLL_TABLE_DIE_MAX } from "@/types/rollTable.types";
import type { RollTableDie } from "@/types/rollTable.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const DIE_OPTIONS: RollTableDie[] = ["1d6", "1d8", "1d10", "1d12", "1d20"];
const dieOptions = DIE_OPTIONS.map((d) => ({ value: d, label: d }));

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen = () => ui.rollTableGeneratorOpen;
const { data: npcs } = useNpcs(panelOpen);
const { data: locations } = useAllLocations(panelOpen);
const { data: factions } = useAllFactions(panelOpen);

const {
  isGenerating,
  error: genError,
  concept: genConcept,
  completedEntityId,
  clearCompleted,
  result,
  generate,
  clearResult,
} = useRollTableGeneration();

const { mutateAsync: createRollTable } = useCreateRollTable();

// Same pools the comboboxes on other generator panels fetch — resolveGeneratedEntities
// just needs the {id, name} shape.
const entityPools = computed(() => ({
  npcs: (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
  locations: (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
  factions: (factions.value ?? []).map((f) => ({ id: f.id, name: f.name })),
}));

// Roll-table chips are display-only: RollTableEntry only carries an
// `encounter_id` link (see rollTable.types.ts), no npc/location/faction
// column, so nothing resolved here is persisted when the DM clicks Create Table.
const resolvedEntities = computed<ResolvedEntity[]>(() =>
  result.value ? resolveGeneratedEntities(result.value, entityPools.value) : [],
);

function goToEntity(entity: ResolvedEntity) {
  if (!entity.id) return;
  ui.rollTableGeneratorOpen = false;
  router.push(`${ENTITY_KIND_ROUTE[entity.kind]}/${entity.id}`);
}

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("roll_table_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const die = ref<RollTableDie>("1d8");
const dieMax = computed(() => ROLL_TABLE_DIE_MAX[die.value]);

const creating = ref(false);
const createdTableId = ref<string | null>(null);

async function runGenerate() {
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  createdTableId.value = null;
  await generate(concept.value.trim(), { die: die.value });
}

async function createTable() {
  if (!result.value) return;
  creating.value = true;
  try {
    const table = await createRollTable({
      campaign_id: campaign.activeCampaignId,
      name: result.value.name,
      description: result.value.description || null,
      dice: die.value,
      entries: result.value.entries.map((e) => ({
        id: crypto.randomUUID(),
        min: e.min,
        max: e.max,
        label: e.label,
        encounter_id: null,
        notes: e.notes ?? null,
      })),
      tags: result.value.tags,
      notes: null,
      ai_provenance: result.value.ai_provenance ?? null,
    });
    createdTableId.value = table.id;
    completedEntityId.value = table.id;
  } finally {
    creating.value = false;
  }
}

function viewCreated() {
  if (!createdTableId.value) return;
  ui.rollTableGeneratorOpen = false;
  router.push(`/roll-tables/${createdTableId.value}`);
}
</script>
