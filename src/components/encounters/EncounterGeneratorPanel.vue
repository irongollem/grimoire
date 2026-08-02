<template>
  <Transition name="fade">
    <div
      v-if="ui.encounterGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.encounterGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Encounter Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="handleClose">
          <IconClose class="h-5 w-5" />
        </button>
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
              GENERATED ENCOUNTER
            </p>
            <button
              type="button"
              class="text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              @click="clearResult"
            >
              Regenerate
            </button>
          </div>

          <div class="rounded-md border border-border bg-muted/30 p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ result.name }}</h3>
              <span class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0 capitalize">{{ result.difficulty }}</span>
            </div>

            <p v-if="result.environment" class="text-caption text-muted-foreground">
              <span class="font-semibold text-foreground">Environment: </span>{{ result.environment }}
            </p>
            <p v-if="result.tactics" class="text-caption text-muted-foreground">
              <span class="font-semibold text-foreground">Tactics: </span>{{ result.tactics }}
            </p>
            <p v-if="result.twist" class="text-caption text-muted-foreground">
              <span class="font-semibold text-foreground">Twist: </span>{{ result.twist }}
            </p>
          </div>

          <div v-if="resolved.matched.length" class="space-y-1.5">
            <p class="text-label-lg font-semibold text-muted-foreground">COMBATANTS</p>
            <ul class="space-y-1">
              <li
                v-for="c in resolved.matched"
                :key="c.id"
                class="text-caption text-foreground"
              >
                {{ c.count }}× {{ matchedLabel(c) }}
              </li>
            </ul>
          </div>

          <div
            v-if="resolved.unmatched.length"
            class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1.5"
          >
            <p class="flex items-center gap-1.5 text-caption font-semibold text-amber-500">
              <IconWarning class="h-3 w-3 shrink-0" />
              Not in your Bestiary — add these manually
            </p>
            <ul class="space-y-0.5">
              <li
                v-for="(entry, i) in resolved.unmatched"
                :key="i"
                class="text-caption text-amber-500/90"
              >
                {{ entry.count }}× {{ unmatchedLabel(entry) }}
              </li>
            </ul>
          </div>

          <!-- Creation failure (e.g. the encounter quota is already full).
               Separate from `genError` above: that block belongs to the error
               *state*, which this result state has replaced — without its own
               slot, a failed create would leave the DM staring at an
               unchanged panel with no explanation. -->
          <div
            v-if="createError"
            class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
          >
            <p class="text-caption text-destructive">{{ createError }}</p>
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
              placeholder="Goblin ambush on the forest road, levels 3–5, a betrayal mid-fight…"
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

          <!-- Difficulty -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              DIFFICULTY
            </label>
            <div class="grid grid-cols-5 gap-2">
              <button
                v-for="option in DIFFICULTY_OPTIONS"
                :key="option.value"
                type="button"
                class="py-1.5 text-caption font-semibold rounded-md border transition-colors"
                :class="difficulty === option.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'"
                @click="difficulty = option.value"
              >{{ option.label }}</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-2">
        <!-- Results: create the encounter -->
        <template v-if="result">
          <button
            v-if="!createdEncounterId"
            type="button"
            :disabled="creating"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="createEncounterFromResult"
          >
            <IconAdd class="h-3.5 w-3.5" />
            {{ creating ? "Creating…" : "Create Encounter" }}
          </button>
          <button
            v-else
            type="button"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            @click="viewCreated"
          >
            <IconCheckCircle class="h-3.5 w-3.5" />
            Open Encounter →
          </button>
        </template>

        <!-- Form: generate -->
        <template v-else>
          <GenerationCostBadge
            v-if="isPro && isAiEnabled"
            :credits="textCreditCost"
            :byok="textIsByok"
            class="self-center"
          />
          <button
            v-if="isPro && isAiEnabled"
            type="button"
            :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
            :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="runGenerate"
          >
            <IconGenerate class="h-3.5 w-3.5" />
            {{ isGenerating ? "Generating…" : "Generate with AI" }}
          </button>
          <button
            v-else-if="!isPro"
            type="button"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            @click="showPaywall = true"
          >
            <IconGenerate class="h-3.5 w-3.5" />
            Generate with AI
          </button>
        </template>
      </div>
    </aside>
  </Transition>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate encounters, NPCs, monsters, items, spells, and more."
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle, IconClose, IconGenerate, IconWarning } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateEncounter } from "@/composables/useEncounters";
import { useEncounterGeneration } from "@/ai/useEncounterGeneration";
import { useSubscription } from "@/composables/useSubscription";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { resolveGeneratedCombatants } from "@/lib/encounters/resolveGeneratedCombatants";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { isQuotaExceeded } from "@/lib/quotaError";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { EncounterCombatantAiResult } from "@/ai/types";

type EncounterDifficultyOption = "auto" | "easy" | "medium" | "hard" | "deadly";

const DIFFICULTY_OPTIONS: { value: EncounterDifficultyOption; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "deadly", label: "Deadly" },
];

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
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
} = useEncounterGeneration();

const { mutateAsync: createEncounter } = useCreateEncounter();
const { data: monsters } = useAllMonsters();
const { data: party } = useParty();
const { data: companions } = useCompanions();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("encounter_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept = ref("");
const difficulty = ref<EncounterDifficultyOption>("auto");

const creating = ref(false);
const createError = ref<string | null>(null);
const createdEncounterId = ref<string | null>(null);

const resolved = computed(() => {
  if (!result.value) return { matched: [] as CombatantDef[], unmatched: [] as EncounterCombatantAiResult[] };
  return resolveGeneratedCombatants(result.value.combatants, monsters.value);
});

function matchedLabel(c: CombatantDef): string {
  if (c.custom_name) return c.custom_name;
  const monster = monsters.value.find((m) => m.id === c.monster_id);
  // custom_name is only null when the AI gave no role, and resolveGeneratedCombatants
  // always builds a matched entry from a monster present in `monsters` — this lookup
  // can't legitimately miss. "???" (this repo's unknown marker) only shows if that
  // invariant is ever broken, rather than silently rendering a blank row.
  return monster ? monster.name : "???";
}

function unmatchedLabel(entry: EncounterCombatantAiResult): string {
  return entry.role ? `${entry.name} (${entry.role})` : entry.name;
}

function handleClose() {
  ui.encounterGeneratorOpen = false;
}

function dismissToBackground() {
  ui.encounterGeneratorOpen = false;
}

async function runGenerate() {
  genConcept.value = concept.value.trim();
  clearCompleted();
  createdEncounterId.value = null;
  await generate(concept.value.trim(), { difficulty: difficulty.value });
}

/** Builds the encounter's Tiptap-JSON description from the AI's flavor text,
 *  plus an "Add manually" line for any combatant the Bestiary lookup missed —
 *  the unmatched list is otherwise lost once the panel closes. */
function buildDescription(): string {
  const parts: string[] = [];
  if (result.value?.environment) parts.push(`Environment: ${result.value.environment}`);
  if (result.value?.tactics) parts.push(`Tactics: ${result.value.tactics}`);
  if (result.value?.twist) parts.push(`Twist: ${result.value.twist}`);
  if (resolved.value.unmatched.length) {
    const names = resolved.value.unmatched.map((u) => unmatchedLabel(u)).join(", ");
    parts.push(`Add manually: ${names}`);
  }
  return toTiptapJson(parts.join("\n\n"));
}

async function createEncounterFromResult() {
  if (!result.value) return;
  creating.value = true;
  createError.value = null;
  try {
    const encounter = await createEncounter({
      name: result.value.name,
      description: buildDescription(),
      party_member_ids: (party.value ?? []).map((m) => m.id),
      // Companions come along too, matching what EncounterDetail does for a
      // hand-built new encounter ("start with the whole party, bench whoever
      // shouldn't join"). They also count as allies in the difficulty
      // calculation — leaving them out would make the generated encounter
      // read as harder than the identical one built by hand.
      companion_ids: (companions.value ?? []).map((c) => c.id),
      party_member_factions: {},
      combatants: resolved.value.matched,
      factions: [...DEFAULT_FACTIONS],
      item_ids: [],
      trap_ids: [],
      reward_currency_pools: [],
      art_objects: [],
      events: [],
      location_id: null,
      is_finished: false,
      lair_enabled: false,
      lair_owner_def_id: null,
    });
    createdEncounterId.value = encounter.id;
    completedEntityId.value = encounter.id;
  } catch (e: unknown) {
    // The generation has already been paid for by the time we get here, so a
    // silent failure would cost the DM a credit and give them nothing. Quota
    // exhaustion gets the paywall (mirroring EncounterDetail.handleSave);
    // anything else is surfaced in the panel.
    if (isQuotaExceeded(e)) showPaywall.value = true;
    else createError.value = e instanceof Error ? e.message : "Could not create the encounter.";
  } finally {
    creating.value = false;
  }
}

function viewCreated() {
  if (!createdEncounterId.value) return;
  ui.encounterGeneratorOpen = false;
  // Straight into the editor, not the read-only sheet. A generated encounter
  // is a draft: the DM has to review the AI's picks, swap what doesn't fit and
  // hand-add anything that wasn't in the Bestiary — all of which is edit-mode
  // work. The roll-table generator links to a view because a generated table
  // is finished on arrival; this one isn't.
  router.push(`/encounters/${createdEncounterId.value}?edit=true`);
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
