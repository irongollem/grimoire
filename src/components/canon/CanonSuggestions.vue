<template>
  <div v-if="isAiEnabled" class="flex flex-col gap-2" :data-testid="`canon-suggest-${mode}`">
    <div class="flex justify-end">
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconGenerate"
        icon-size="xs"
        :loading="isGenerating"
        :disabled="isAnyAiGenerating"
        :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
        :label="copy.open"
        @click="showSteer = !showSteer"
      />
    </div>

    <div v-if="showSteer" class="flex flex-col gap-3 border border-border bg-muted/30 p-3">
      <div>
        <label class="mb-1 block text-label-lg font-semibold text-muted-foreground" :for="steerId">
          {{ copy.steerLabel }}
          <span v-if="mode === 'truths'" class="font-fell font-normal normal-case text-muted-foreground">(optional)</span>
        </label>
        <!-- An AI-prompt field: native on purpose (CLAUDE.md, Sanctioned Exceptions), the model receives it as written. -->
        <textarea
          :id="steerId"
          v-model="steer"
          rows="3"
          :maxlength="AI_PROMPT_LIMIT"
          class="w-full resize-y border border-border bg-card p-2 text-body text-foreground placeholder:text-muted-foreground"
          :placeholder="copy.placeholder"
        />
      </div>
      <div class="flex items-center justify-end gap-2">
        <GenerationCostBadge :credits="cost" :byok="textIsByok" />
        <AppButton variant="subtle" size="sm" label="Cancel" @click="showSteer = false" />
        <AppButton
          variant="primary"
          size="sm"
          :icon="IconGenerate"
          icon-size="xs"
          :loading="isGenerating"
          :disabled="isAnyAiGenerating || (mode === 'premise' && steer.trim() === '')"
          :label="copy.run"
          @click="run"
        />
      </div>
    </div>

    <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    <div v-if="isGenerating" class="space-y-2" role="status" aria-live="polite">
      <p class="flex items-center gap-2 text-caption italic text-muted-foreground">
        <BannerLoader class="h-4" />
        {{ copy.waiting }}
      </p>
      <ListSkeleton variant="text" :count="3" />
    </div>

    <div v-if="proposals.length > 0 || setAside.length > 0" class="flex flex-col gap-2 border border-border bg-muted/30 p-3">
      <div class="flex items-center justify-between">
        <div class="text-label-lg font-semibold text-muted-foreground">{{ copy.heading }}</div>
        <AppButton variant="subtle" size="sm" label="Dismiss all" @click="dismissAll" />
      </div>
      <p class="text-caption text-muted-foreground">Nothing is saved until you accept one. An accepted entry carries the AI label until you change it.</p>
      <div v-for="p in proposals" :key="p.key" class="flex flex-col gap-2 border border-border bg-card p-3" data-testid="canon-proposal">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-eyebrow text-muted-foreground">{{ p.tag }}</span>
          <span v-if="p.knowers" class="text-caption text-muted-foreground">
            <template v-if="p.knowers.length > 0">known to {{ p.knowers.join(", ") }}</template>
          </span>
        </div>
        <p class="text-body text-foreground">{{ p.text }}</p>
        <div class="flex justify-end gap-1">
          <AppButton variant="primary" size="sm" :icon="IconCheck" icon-size="xs" label="Accept" :disabled="isAccepting" @click="accept(p.source)" />
          <AppButton variant="subtle" size="sm" label="Dismiss" :disabled="isAccepting" @click="dismiss(p.source)" />
        </div>
      </div>
      <p v-for="a in setAside" :key="`aside:${a.claim}`" class="text-caption italic text-muted-foreground">
        Set aside: "{{ a.claim }}". {{ capitalised(a.reason) }}.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The two canon helpers (#1226 story 2, frame 13): "Draft from a pitch" for the premise and "Suggest truths" for the
 * truths. A steer box, a cost badge, then proposals one by one with Accept and Dismiss. Nothing is written until the
 * DM accepts; an accepted entry carries the run's `ai_provenance`. Mounted by the sections, for the DM only.
 */
import { computed, ref, useId } from "vue";
import { IconCheck, IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { plainTextToTiptap } from "./canonParts";
import { useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useKnownTo } from "@/composables/canon/useKnownTo";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCanonSuggestions, type PremiseSuggestion, type TruthSuggestion } from "@/ai/useCanonSuggestions";
import type { AiProvenance } from "@/ai/provenance";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import type { CanonEntry } from "@/types/canon.types";

type Suggestion = PremiseSuggestion | TruthSuggestion;

const { mode, entries } = defineProps<{ mode: "premise" | "truths"; entries: readonly CanonEntry[] }>();

const COPY = {
  premise: {
    open: "Draft from a pitch",
    run: "Draft",
    steerLabel: "Your pitch, in a few lines",
    placeholder: "A drowned kingdom, a gentle tone, a party of lamplighters…",
    waiting: "Reading your campaign and your pitch. This takes a little while.",
    heading: "Suggested premise entries",
    ledger: "canon_premise_suggestion",
  },
  truths: {
    open: "Suggest truths",
    run: "Suggest truths",
    steerLabel: "Steer the truths",
    placeholder: "e.g. something about the river, and one the guild keeps quiet",
    waiting: "Reading your campaign for truths. This takes a little while.",
    heading: "Suggested truths",
    ledger: "canon_truth_suggestion",
  },
} as const;
const copy = computed(() => COPY[mode]);

const KIND_TAG: Record<PremiseSuggestion["kind"], string> = {
  pitch: "Pitch",
  theme: "Theme",
  table: "At the table",
  voice: "Voice",
  look: "Look",
};
const MARK_TAG = { all: "Known to all", some: "Known to some", secret: "Secret" } as const;

const campaign = useCampaignStore();
const toast = useToast();
const { confirm } = useConfirm();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const steerId = useId();

const { suggest, suggestions, setAside, provenance, isGenerating, error, dismiss, dismissAll } = useCanonSuggestions(mode);
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const cost = computed(() => textCredits(costOf(copy.value.ledger)));

const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: updateEntry } = useUpdateCanonEntry();
// No entry yet: only `nameKnower`, which takes the new truth's id, is used.
const { nameKnower } = useKnownTo(() => null);

const showSteer = ref(false);
const steer = ref("");
const isAccepting = ref(false);

async function run() {
  if (!canSpend(cost.value, textIsByok.value)) return;
  const ok = await suggest(steer.value);
  if (ok) {
    showSteer.value = false;
    steer.value = "";
  }
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isTruth(s: Suggestion): s is TruthSuggestion {
  return "title" in s;
}

const proposals = computed(() =>
  (suggestions.value as Suggestion[]).map((source, i) =>
    isTruth(source)
      ? { key: `${i}:${source.title}`, source, tag: MARK_TAG[source.knowledge], text: source.title, knowers: source.knowers.map((k) => k.name) }
      : { key: `${i}:${source.kind}:${source.text}`, source, tag: KIND_TAG[source.kind], text: source.text, knowers: null },
  ),
);

/** The run's provenance, copied onto each accepted write (an entry, and the ties a truth comes with). */
function stamp(): { ai_provenance?: AiProvenance } {
  const p: AiProvenance | null = provenance.value;
  return p ? { ai_provenance: { ...p } } : {};
}

const PITCH_TEXT = (text: string) => plainTextToTiptap(text);

async function acceptPremise(s: PremiseSuggestion) {
  const single = s.kind === "pitch" || s.kind === "voice" || s.kind === "look";
  const field = s.kind === "pitch" ? { body: PITCH_TEXT(s.text) } : { title: s.text };
  const existing = single ? entries.find((e) => e.part === "premise" && e.premise_kind === s.kind) : undefined;
  if (existing) {
    const ok = await confirm("Replace the existing text?", { title: `Replace the ${s.kind}`, confirmLabel: "Replace", danger: false });
    if (!ok) return false;
    await updateEntry({ id: existing.id, patch: { ...field, ...stamp() } });
    return true;
  }
  const count = entries.filter((e) => e.part === "premise" && e.premise_kind === s.kind).length;
  await createEntry({ part: "premise", premise_kind: s.kind, ...field, player_visible_to: [], sort_order: count, ...stamp() });
  return true;
}

async function acceptTruth(s: TruthSuggestion) {
  const count = entries.filter((e) => e.part === "truth").length;
  const created = await createEntry({ part: "truth", knowledge: s.knowledge, title: s.title, sort_order: count, ...stamp() });
  // The ties come after the truth exists; a tie that fails has already told the DM, and the truth stays.
  const tie = stamp().ai_provenance;
  for (const k of s.knowers) await nameKnower(created.id, { kind: k.kind, id: k.id, name: k.name }, tie);
  return true;
}

async function accept(s: Suggestion) {
  isAccepting.value = true;
  try {
    const done = isTruth(s) ? await acceptTruth(s) : await acceptPremise(s);
    if (done) dismiss(s as never);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not save that suggestion.");
  } finally {
    isAccepting.value = false;
  }
}
</script>
