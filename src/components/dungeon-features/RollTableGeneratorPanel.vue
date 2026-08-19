<template>
  <Transition name="fade">
    <div
      v-if="ui.rollTableGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.rollTableGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Roll Table Generator</h2>
        <AppButton variant="ghost" size="icon-sm" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="handleClose" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Generating state -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">
            {{ currentLoadingQuote }}
          </p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="dismissToBackground"
          >
            Continue in background
          </button>
        </div>

        <!-- Error state -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>

        <!-- Results state -->
        <template v-else-if="result">
          <div class="flex items-center justify-between">
            <p class="text-label-lg font-semibold text-muted-foreground">
              GENERATED TABLE
            </p>
            <button
              type="button"
              class="text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              @click="clearResult"
            >
              Regenerate
            </button>
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

        <!-- Form state -->
        <template v-else>
          <!-- Concept -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              CONCEPT
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
            </label>
            <textarea
              v-model="concept"
              rows="4"
              :maxlength="CONCEPT_LIMIT"
              placeholder="Forest road at night, bandits active in the region, levels 3–5…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div class="flex justify-end mt-1">
              <span
                class="text-caption"
                :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
              >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
            </div>
          </div>

          <div class="gold-divider" />

          <!-- Die -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              DIE
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(entries cover 1–{{ dieMax }})</span>
            </label>
            <div class="grid grid-cols-5 gap-2">
              <button
                v-for="d in DIE_OPTIONS"
                :key="d"
                type="button"
                class="py-1.5 text-label-lg font-semibold rounded-md border transition-colors"
                :class="die === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'"
                @click="die = d"
              >{{ d }}</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-2">
        <!-- Results: create the table -->
        <template v-if="result">
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

        <!-- Form: generate -->
        <template v-else>
          <GenerationCostBadge
            v-if="isPro && isAiEnabled"
            :credits="textCreditCost"
            :byok="textIsByok"
            class="self-center"
          />
          <AppButton
            v-if="isPro && isAiEnabled"
            variant="primary"
            size="md"
            block
            :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
            :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
            :icon="IconGenerate"
            :label="isGenerating ? 'Generating…' : 'Generate with AI'"
            @click="runGenerate"
          />
          <AppButton
            v-else-if="!isPro"
            variant="primary"
            size="md"
            block
            :icon="IconGenerate"
            label="Generate with AI"
            @click="showPaywall = true"
          />
        </template>
      </div>
    </aside>
  </Transition>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate roll tables, NPCs, monsters, items, spells, and more."
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle, IconClose, IconGenerate } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useAllFactions } from "@/composables/useFactions";
import { useCreateRollTable } from "@/composables/useRollTables";
import { useRollTableGeneration } from "@/ai/useRollTableGeneration";
import { resolveGeneratedEntities, type ResolvedEntity } from "@/ai/resolveGeneratedEntities";
import GeneratedEntityChips from "@/components/common/GeneratedEntityChips.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useSubscription } from "@/composables/useSubscription";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { ROLL_TABLE_DIE_MAX } from "@/types/rollTable.types";
import type { RollTableDie } from "@/types/rollTable.types";

const DIE_OPTIONS: RollTableDie[] = ["1d6", "1d8", "1d10", "1d12", "1d20"];

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen = () => ui.rollTableGeneratorOpen;
const { data: npcs } = useNpcs(panelOpen);
const { data: locations } = useAllLocations(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
const { isPro } = useSubscription();
const showPaywall = ref(false);

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

const isAiEnabled = computed(() => campaign.isAiEnabled);

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

const ENTITY_CHIP_ROUTE: Record<ResolvedEntity["kind"], string> = {
  npc: "/npcs",
  location: "/locations",
  faction: "/factions",
};

function goToEntity(entity: ResolvedEntity) {
  if (!entity.id) return;
  ui.rollTableGeneratorOpen = false;
  router.push(`${ENTITY_CHIP_ROUTE[entity.kind]}/${entity.id}`);
}

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("roll_table_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept = ref("");
const die = ref<RollTableDie>("1d8");
const dieMax = computed(() => ROLL_TABLE_DIE_MAX[die.value]);

const creating = ref(false);
const createdTableId = ref<string | null>(null);

function handleClose() {
  ui.rollTableGeneratorOpen = false;
}

function dismissToBackground() {
  ui.rollTableGeneratorOpen = false;
}

async function runGenerate() {
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

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
