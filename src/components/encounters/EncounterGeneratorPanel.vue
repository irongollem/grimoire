<template>
  <GeneratorPanelShell
    v-model:open="ui.encounterGeneratorOpen"
    v-model:concept="concept"
    title="Encounter Generator"
    concept-placeholder="Goblin ambush on the forest road, levels 3–5, a betrayal mid-fight…"
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
        <label class="block text-caption text-muted-foreground mb-1">Difficulty</label>
        <SegmentedControl
          v-model="difficulty"
          :options="DIFFICULTY_OPTIONS"
          variant="subtle"
          size="sm"
          gap="loose"
          block
        />
      </div>
    </template>

    <template v-if="result" #results>
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">
          GENERATED ENCOUNTER
        </p>
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="underline underline-offset-2"
          label="Regenerate"
          @click="clearResult"
        />
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-heading-sm font-bold text-foreground leading-tight">{{ result.name }}</h3>
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

      <div v-if="finalMatches.length" class="space-y-1.5">
        <p class="text-label-lg font-semibold text-muted-foreground">COMBATANTS</p>
        <!-- #601: same-named creatures exist in several enabled sourcebooks,
             each with its own stat block, and name resolution had to pick
             one. The picker says which — and lets the DM swap. -->
        <p v-if="hasAmbiguousMatches" class="text-caption text-muted-foreground italic">
          Some of these exist in more than one of your sourcebooks: the version
          shown is the one the encounter will use.
        </p>
        <ul class="space-y-1">
          <!-- Keyed on entryIndex, not def.id: def ids are re-minted on
               every `resolved` recompute, so keying on them would remount
               every row (destroying an open version picker mid-use)
               whenever any monster changes anywhere in the app. -->
          <li
            v-for="m in finalMatches"
            :key="m.entryIndex"
            class="text-caption text-foreground"
          >
            {{ m.def.count }}× {{ matchedLabel(m) }}
            <div v-if="m.candidates.length > 1" class="mt-1 flex items-center gap-1.5">
              <span class="text-label text-muted-foreground shrink-0">Version</span>
              <EntityCombobox
                :model-value="m.monster.id"
                :options="versionOptions(m)"
                placeholder="Version…"
                @update:model-value="setVersionPick(m.entryIndex, $event)"
              />
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="resolved.unmatched.length"
        class="rounded-md border border-tone-caution/30 bg-tone-caution/10 px-3 py-2 space-y-1.5"
      >
        <p class="flex items-center gap-1.5 text-caption font-semibold text-ink-caution">
          <IconWarning class="h-3 w-3 shrink-0" />
          Not in your Bestiary: add these manually
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="(entry, i) in resolved.unmatched"
            :key="i"
            class="text-caption text-ink-caution/90"
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

    <template #results-footer>
      <AppButton
        v-if="!createdEncounterId"
        variant="primary"
        size="md"
        block
        :icon="IconAdd"
        :disabled="creating || monstersLoading"
        :label="creating ? 'Creating…' : 'Create Encounter'"
        @click="createEncounterFromResult"
      />
      <AppButton
        v-else
        variant="primary"
        size="md"
        block
        :icon="IconCheckCircle"
        label="Open Encounter →"
        @click="viewCreated"
      />
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle, IconWarning } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateEncounter } from "@/composables/encounters/useEncounters";
import { useEncounterGeneration } from "@/ai/useEncounterGeneration";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useParty } from "@/composables/party/useParty";
import { useCompanions } from "@/composables/encounters/useCompanions";
import {
  resolveGeneratedCombatants,
  swapCombatantVersion,
  type GeneratedCombatantMatch,
  type ResolvableMonster,
} from "@/lib/encounters/resolveGeneratedCombatants";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { EncounterCombatantAiResult } from "@/ai/types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

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
// The bestiary resolves the AI's combatant names, so it must be loaded
// whenever a result can be shown or built from: the panel is open, a
// generation is in flight (its result will land here even if the panel is
// closed meanwhile), or a result is held. A closed, idle panel fetches nothing
// (#972) — the panel is mounted on every DM page.
const { data: monsters, isLoading: monstersLoading } = useMonsterIndex(() => ({
  enabled: ui.encounterGeneratorOpen || isGenerating.value || !!result.value,
}));
const { data: party } = useParty();
const { data: companions } = useCompanions();

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("encounter_generation") * textMultiplierFor(textProvider.value)),
);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("encounters");

const concept = ref("");
const difficulty = ref<EncounterDifficultyOption>("auto");

const creating = ref(false);
const createError = ref<string | null>(null);
const createdEncounterId = ref<string | null>(null);

const resolved = computed(() => {
  if (!result.value || !monsters.value) {
    return { matched: [] as GeneratedCombatantMatch[], unmatched: [] as EncounterCombatantAiResult[] };
  }
  return resolveGeneratedCombatants(result.value.combatants, monsters.value);
});

// The DM's version picks for ambiguous names (#601), keyed by the entry's
// position in the AI result's combatants array (`entryIndex`) — NOT by
// position in `matched`. `resolved` also recomputes when `monsters.value`
// changes (this panel stays mounted in the background, and its own "add these
// manually" list invites the DM to go create a missing monster, which
// invalidates the monsters query), and such a recompute can flip entries
// between matched and unmatched, shifting matched indices. entryIndex is
// fixed for the lifetime of `result`, so a pick can never reattach to a
// different combatant. Reset whenever a new generation lands.
const versionPicks = ref<Record<number, string>>({});
watch(result, () => {
  versionPicks.value = {};
});

const finalMatches = computed(() =>
  resolved.value.matched.map((m) => {
    const pick = versionPicks.value[m.entryIndex];
    return pick ? swapCombatantVersion(m, pick) : m;
  }),
);

// Reads `resolved`, not `finalMatches`: whether a name was ambiguous is a
// fact about resolution, fixed per generation — a swap never changes it.
const hasAmbiguousMatches = computed(() =>
  resolved.value.matched.some((m) => m.candidates.length > 1),
);

function setVersionPick(entryIndex: number, monsterId: string) {
  // The combobox's × clear hands back "" — that means "back to the default
  // pick", not "no monster".
  if (monsterId) versionPicks.value[entryIndex] = monsterId;
  else delete versionPicks.value[entryIndex];
}

/** Labels one version of an ambiguous name for the picker: where it comes
 *  from, and its CR — the CR is the point, since same-named versions are
 *  rebalanced across publishers and drive the XP budget. "???" is the repo's
 *  unknown marker: a library row missing all source metadata is a data gap
 *  worth seeing, not something to blank over. */
function versionLabel(m: ResolvableMonster): string {
  const origin = m.is_shared ? (m.source_title ?? m.source ?? "???") : "Your bestiary";
  return `${origin} · CR ${m.challenge_rating}`;
}

function versionOptions(match: GeneratedCombatantMatch): { id: string; name: string }[] {
  return match.candidates.map((m) => ({ id: m.id, name: versionLabel(m) }));
}

function matchedLabel(m: GeneratedCombatantMatch): string {
  return m.def.custom_name ?? m.monster.name;
}

function unmatchedLabel(entry: EncounterCombatantAiResult): string {
  return entry.role ? `${entry.name} (${entry.role})` : entry.name;
}

async function runGenerate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

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
  // Never build combatants against a bestiary that has not arrived: every name
  // would read as unmatched and the encounter would be created empty.
  if (!result.value || monstersLoading.value) return;
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
      combatants: finalMatches.value.map((m) => m.def),
      factions: [...DEFAULT_FACTIONS],
      item_ids: [],
      trap_ids: [],
      reward_currency_pools: [],
      events: [],
      location_id: null,
      is_finished: false,
      lair_enabled: false,
      lair_owner_def_id: null,
      ai_provenance: result.value.ai_provenance ?? null,
    });
    createdEncounterId.value = encounter.id;
    completedEntityId.value = encounter.id;
  } catch (e: unknown) {
    // The generation has already been paid for by the time we get here, so a
    // silent failure would cost the DM a credit and give them nothing.
    // Quota exhaustion gets the paywall; anything else is surfaced in the panel.
    if (!gateQuotaError(e)) {
      createError.value = e instanceof Error ? e.message : "Could not create the encounter.";
    }
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
