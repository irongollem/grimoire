<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="open"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">{{ dialogTitle }}</h2>
        <AppButton variant="ghost" size="inline-xs" icon-size="lg" :icon="IconClose" tooltip="Close" aria-label="Close" @click="handleClose" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Generating state -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">
            {{ currentLoadingQuote }}
          </p>
          <AppButton
            variant="ghost"
            size="inline-caption"
            class="mt-1 underline underline-offset-2"
            label="Continue in background"
            @click="dismissToBackground"
          />
        </div>

        <!-- Error state -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>

        <!-- Preview state: exactly what firing this event would do — nothing here
             has touched the encounter yet (see handleAddToEvents). -->
        <template v-else-if="resolved">
          <p class="text-label-lg font-semibold text-muted-foreground">{{ previewLabel }}</p>

          <div class="rounded-md border border-border bg-muted/30 p-4 space-y-3">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ resolved.name }}</h3>
            <p class="text-body text-foreground italic border-l-2 border-primary/40 pl-3">
              {{ resolved.narration }}
            </p>

            <ul v-if="resolved.reinforcements.length" class="space-y-1.5">
              <li
                v-for="(r, i) in resolved.reinforcements"
                :key="i"
                class="flex items-start gap-2 text-caption"
                :class="r.kind === 'unmatched' ? 'text-muted-foreground' : 'text-foreground'"
              >
                <template v-if="r.kind !== 'unmatched'">
                  <span class="text-label text-primary font-semibold shrink-0 mt-0.5 w-8 text-right">{{ r.count }}×</span>
                  <span class="min-w-0">
                    <span class="font-semibold">{{ r.name }}</span>
                    <span class="text-muted-foreground"> — {{ r.factionName }}</span>
                    <span v-if="r.role" class="italic text-muted-foreground/70"> ({{ r.role }})</span>
                  </span>
                </template>
                <template v-else>
                  <span class="text-label shrink-0 mt-0.5 w-8 text-right">—</span>
                  <span class="min-w-0">
                    <span class="line-through">{{ r.name }}</span>
                    <span class="italic text-muted-foreground/70"> — {{ r.reason }}, will not be added</span>
                  </span>
                </template>
              </li>
            </ul>

            <div v-if="resolved.environment" class="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1">
              <p class="text-label-lg font-semibold text-amber-500 flex items-center gap-1">
                <IconWarning class="h-3.5 w-3.5 shrink-0" />
                {{ resolved.environment.label }}
              </p>
              <p class="text-caption text-foreground">{{ resolved.environment.description }}</p>
            </div>
          </div>

          <!-- Anything silently impossible, made loud — see resolveGeneratedComplication. -->
          <div v-if="resolved.warnings.length" class="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-1.5">
            <div v-for="(w, i) in resolved.warnings" :key="i" class="flex gap-2">
              <IconWarning class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p class="text-caption text-muted-foreground">{{ w }}</p>
            </div>
          </div>

          <div v-if="result?.grounded === false" class="rounded-md border border-border bg-muted/30 px-3 py-2 flex gap-2">
            <IconWarning class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p class="text-caption text-muted-foreground">
              This generation ran without your bestiary/cast index (the semantic index isn't available), so any
              unresolved creature name above is the model guessing rather than checked against your roster.
            </p>
          </div>
        </template>

        <!-- Form state -->
        <template v-else>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              STEER
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional — AI will use this)</span>
            </label>
            <textarea
              v-model="steer"
              rows="2"
              :maxlength="STEER_LIMIT"
              :placeholder="steerPlaceholder"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div class="flex justify-end mt-1">
              <span
                class="text-caption"
                :class="steer.length >= STEER_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
              >{{ steer.length }} / {{ STEER_LIMIT }}</span>
            </div>
          </div>

          <div class="gold-divider" />

          <AppCheckbox
            v-model="isPlayerVisible"
            label="Show to players when fired"
            label-role="caption"
          />
        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-2">
        <!-- Preview: approve, retry, or abandon -->
        <template v-if="resolved">
          <p v-if="persistError" class="text-caption text-destructive text-center">{{ persistError }}</p>
          <AppButton
            variant="primary"
            size="md"
            block
            :icon="IconAdd"
            :disabled="addingToEvents"
            :label="addingToEvents ? 'Adding…' : 'Add to Events'"
            @click="handleAddToEvents"
          />
          <div class="flex gap-2">
            <AppButton
              variant="subtle"
              size="caption"
              class="flex-1"
              :icon="IconRefresh"
              icon-size="xs"
              :disabled="addingToEvents || isAnyAiGenerating"
              label="Regenerate"
              @click="runGenerate"
            />
            <AppButton
              variant="subtle"
              size="caption"
              class="flex-1"
              :disabled="addingToEvents"
              label="Discard"
              @click="handleDiscard"
            />
          </div>
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
            :icon="IconGenerate"
            :disabled="isAnyAiGenerating || !affordable(textCreditCost, textIsByok)"
            :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
            :label="isGenerating ? 'Generating…' : 'Generate'"
            @click="runGenerate"
          />
          <AppButton
            v-else-if="!isPro"
            variant="primary"
            size="md"
            block
            :icon="IconGenerate"
            label="Generate"
            @click="showPaywall = true"
          />
        </template>
      </div>
    </aside>
  </Transition>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate mid-fight complications, reinforcements, and more."
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { IconAdd, IconClose, IconGenerate, IconRefresh, IconWarning } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useComplicationGeneration, type ComplicationMode } from "@/ai/useComplicationGeneration";
import { resolveGeneratedComplication, buildComplicationEvent } from "@/ai/resolveGeneratedComplication";
import { useSubscription } from "@/composables/billing/useSubscription";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { supabase } from "@/lib/supabase";
import type { EncounterEvent } from "@/types/encounter.types";

const STEER_LIMIT = AI_PROMPT_LIMIT_SHORT;

const STEER_PLACEHOLDERS: Record<ComplicationMode, string> = {
  complication: "A rope bridge starts to fray, poisoned darts from the shadows, a captive tries to flee…",
  reinforcements: "A second warband answers the horn, guards pour in from the north tunnel…",
};

const { mode } = defineProps<{ mode: ComplicationMode }>();
const open = defineModel<boolean>({ required: true });

const campaign = useCampaignStore();
const store = useEncounterRunStore();
const { isPro } = useSubscription();
const showPaywall = ref(false);

const {
  isGenerating,
  error: genError,
  result,
  generate,
  clearResult,
} = useComplicationGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const dialogTitle = computed(() => (mode === "complication" ? "Generate Complication" : "Generate Reinforcements"));
const previewLabel = computed(() => (mode === "complication" ? "PROPOSED COMPLICATION" : "PROPOSED REINFORCEMENTS"));
const steerPlaceholder = computed(() => STEER_PLACEHOLDERS[mode]);

const steer = ref("");
const isPlayerVisible = ref(true);

// The generation composable is a single module-level singleton shared by both
// modes (see useComplicationGeneration) — reopening this dialog for the OTHER
// mode must not show a leftover preview/error from the mode that was open
// last. Only fires on an actual mode switch, so re-picking the same mode
// after a Discard keeps whatever the DM already typed.
watch(
  () => mode,
  () => {
    clearResult();
    steer.value = "";
    isPlayerVisible.value = true;
    persistError.value = null;
  },
);

// Resolved against THIS runner's own rosters and factions — never the
// server's, which only had names to work with. See resolveGeneratedComplication.
const resolved = computed(() =>
  result.value
    ? resolveGeneratedComplication(result.value, {
      monsters: store.availableMonsters,
      npcs: store.availableNpcs,
      factions: store.factions,
    })
    : null,
);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("complication_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

function handleClose() {
  open.value = false;
}

function dismissToBackground() {
  open.value = false;
}

async function runGenerate() {
  await generate(mode, steer.value.trim());
}

function handleDiscard() {
  clearResult();
  persistError.value = null;
}

const addingToEvents = ref(false);
const persistError = ref<string | null>(null);

/**
 * Approve the preview. The event joins the runner's live list UNFIRED — the
 * DM still presses ▶ in the events list when they actually want it to go off
 * (see addGeneratedEvent) — and is separately written into the encounter row
 * because the player-visible narrative beat resolves event definitions from
 * `encounters.events`, not from live state. Read-modify-write so a concurrent
 * builder edit to the same row isn't clobbered.
 */
async function handleAddToEvents() {
  if (!resolved.value) return;
  persistError.value = null;
  addingToEvents.value = true;
  try {
    const event = buildComplicationEvent(resolved.value, { isPlayerVisible: isPlayerVisible.value });
    store.addGeneratedEvent(event);

    const encounterId = store.encounterId;
    if (!encounterId) throw new Error("No active encounter — the event is in the runner but was not saved.");

    const { data, error: selectError } = await supabase
      .from("encounters")
      .select("events")
      .eq("id", encounterId)
      .maybeSingle();
    if (selectError) throw selectError;

    const existing = (data?.events ?? []) as EncounterEvent[];
    const { error: updateError } = await supabase
      .from("encounters")
      .update({ events: [...existing, event] })
      .eq("id", encounterId);
    if (updateError) throw updateError;

    clearResult();
    steer.value = "";
    isPlayerVisible.value = true;
    open.value = false;
  } catch (e) {
    persistError.value = e instanceof Error
      ? `Couldn't save this event: ${e.message}. It's in the runner but won't reach players.`
      : "Couldn't save this event. It's in the runner but won't reach players.";
  } finally {
    addingToEvents.value = false;
  }
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
