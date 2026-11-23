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
        @click="toggleSteer"
      />
    </div>

    <div v-if="showSteer" class="flex flex-col gap-3 border border-border bg-muted/30 p-3">
      <div>
        <label class="mb-1 block text-label-lg font-semibold text-muted-foreground" :for="steerId">
          {{ copy.steerLabel }}
          <span v-if="mode !== 'premise'" class="font-fell font-normal normal-case text-muted-foreground">(optional)</span>
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
          :disabled="isAnyAiGenerating || (mode === 'premise' && steer.trim() === '') || (mode === 'lore' && (lore?.title.trim() ?? '') === '')"
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
      <p v-if="hasBoundarySuggestions" class="text-caption text-muted-foreground">Accepting a line or veil makes it an active rule for AI generations immediately. It stays private until you share it; review it with your players before accepting.</p>
      <div v-for="p in proposals" :key="p.key" class="flex flex-col gap-2 border border-border bg-card p-3" data-testid="canon-proposal">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-eyebrow text-muted-foreground">{{ p.tag }}</span>
          <span v-if="p.knowers" class="text-caption text-muted-foreground">
            <template v-if="p.knowers.length > 0">known to {{ p.knowers.join(", ") }}</template>
          </span>
          <CanonRef v-if="p.spot" :kind="p.spot.kind" :name="p.spot.name" />
          <CanonRef v-if="p.who" :kind="p.who.kind" :name="p.who.name" />
        </div>
        <p class="text-body text-foreground">{{ p.text }}</p>
        <p v-if="p.detail" class="text-caption text-muted-foreground">{{ p.detail }}</p>
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
 * The canon helpers (#1226, frame 13): "Draft from a pitch" for the premise, "Suggest truths" for the truths, "Place
 * clues" for one secret and "Suggest questions" for the open questions and "Suggest forces" for what is moving. A steer box, a cost badge, then proposals one by one with Accept and Dismiss. Nothing is written until the
 * DM accepts; an accepted entry carries the run's `ai_provenance`. Mounted by the sections, for the DM only.
 */
import { computed, ref, useId } from "vue";
import { IconCheck, IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import CanonRef from "./CanonRef.vue";
import { plainTextToTiptap } from "@/lib/canon/canonParts";
import { useCanonClues, useCreateCanonClue, type NewCanonClue } from "@/composables/canon/useCanonClues";
import { useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useAcceptForce } from "@/composables/canon/useCanonForces";
import { splitReplacement, useAcceptLore } from "@/composables/canon/useAcceptLore";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useKnownTo } from "@/composables/canon/useKnownTo";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCanonSuggestions, type ClueSuggestion, type ForceSuggestion, type LoreSuggestion, type PremiseSuggestion, type QuestionSuggestion, type TruthSuggestion } from "@/ai/useCanonSuggestions";
import type { AiProvenance } from "@/ai/provenance";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { premiseEntryText } from "@edge-shared/worldBlock.ts";
import type { CanonEntry, LoreKind, PremiseKind } from "@/types/canon.types";

type Suggestion = PremiseSuggestion | TruthSuggestion | ClueSuggestion | QuestionSuggestion | ForceSuggestion | LoreSuggestion;

const { mode, entries, secretId = null, lore = null } = defineProps<{
  mode: "premise" | "truths" | "clues" | "questions" | "forces" | "lore";
  /** The entries the mode adds to: premise entries, truths or questions. Unused by `clues`, which counts the secret's own. */
  entries: readonly CanonEntry[];
  /** Required by `clues`: the secret the clues are for. */
  secretId?: string | null;
  /**
   * Required by `lore`: the title and kind the DM gave. With an `entryId` the helper splits that entry's own `text`
   * into passages and replaces its passages; without one it drafts a whole new entry.
   */
  lore?: { title: string; kind: LoreKind | null; entryId: string | null; text: string } | null;
}>();
const emit = defineEmits<{ accepted: [entryId: string] }>();

const COPY = {
  premise: {
    open: "Draft from a pitch",
    run: "Draft",
    steerLabel: "Your pitch, in a few lines",
    placeholder: "A drowned kingdom, a gentle tone, a party of lamplighters…",
    waiting: "Reading your campaign and your pitch. This takes a little while.",
    heading: "Suggested premise entries",
  },
  truths: {
    open: "Suggest truths",
    run: "Suggest truths",
    steerLabel: "Steer the truths",
    placeholder: "e.g. something about the river, and one the guild keeps quiet",
    waiting: "Reading your campaign for truths. This takes a little while.",
    heading: "Suggested truths",
  },
  clues: {
    open: "Place clues",
    run: "Place clues",
    steerLabel: "Steer the clues",
    placeholder: "e.g. keep one clue in the Mint Fields, make one a song",
    waiting: "Reading your campaign for places to put clues. This takes a little while.",
    heading: "Suggested clues",
  },
  questions: {
    open: "Suggest questions",
    run: "Suggest questions",
    steerLabel: "Steer the questions",
    placeholder: "e.g. something about the guild, and one about the river",
    waiting: "Reading your campaign for questions to keep open. This takes a little while.",
    heading: "Suggested questions",
  },
  forces: {
    open: "Suggest forces",
    run: "Suggest forces",
    steerLabel: "Steer the forces",
    placeholder: "e.g. one faction with a slow plan, and a power the party has not met",
    waiting: "Reading your campaign for what could be moving. This takes a little while.",
    heading: "Suggested forces",
  },
  lore: {
    open: "Draft a lore entry",
    run: "Draft",
    steerLabel: "Steer the draft",
    placeholder: "e.g. told in four passages, the last one a secret",
    waiting: "Reading your campaign to draft this lore. This takes a little while.",
    heading: "Suggested lore",
  },
  split: {
    open: "Split into passages",
    run: "Split",
    steerLabel: "Steer the split",
    placeholder: "e.g. keep the ending for last",
    waiting: "Reading the entry to split it into passages. This takes a little while.",
    heading: "Suggested passages",
  },
} as const;
const copy = computed(() => (mode === "lore" && lore?.entryId ? COPY.split : COPY[mode]));

const SPOT_TAG = { location: "A place you have", npc: "A person you have", quest_beat: "A beat you have" } as const;
const KIND_TAG: Record<PremiseKind, string> = {
  pitch: "Pitch",
  theme: "Theme",
  table: "At the table",
  voice: "Voice",
  look: "Look",
  line: "Line",
  veil: "Veil",
};
const BOUNDARY_KINDS: readonly PremiseKind[] = ["line", "veil"];
const MARK_TAG = { all: "Known to all", some: "Known to some", secret: "Secret" } as const;

const campaign = useCampaignStore();
const toast = useToast();
const { confirm } = useConfirm();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const steerId = useId();

const { suggest, suggestions, setAside, provenance, isGenerating, error, dismiss, dismissAll } = useCanonSuggestions(mode, mode === "lore" ? (lore?.entryId ?? "new") : undefined);
const { canSpend } = useGenerationGate();
const quoteFor = useCanonSuggestionsQuote();
const { textIsByok } = useCampaignProviders();
// The split of one entry is priced as lore, as the server does: the mode, not the button's wording, is what is charged.
const cost = computed(() => quoteFor(mode).total);

const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: createClue } = useCreateCanonClue();
const { data: allClues } = useCanonClues(() => mode === "clues" || mode === "lore");
const { mutateAsync: updateEntry } = useUpdateCanonEntry();
const writeForce = useAcceptForce();
const acceptLoreWrites = useAcceptLore();
const { data: allPassages } = useCanonPassages(() => mode === "lore");
// No entry yet: only `nameKnower`, which takes the new truth's id, is used.
const { nameKnower } = useKnownTo(() => null);

const showSteer = ref(false);
const steer = ref("");
const isAccepting = ref(false);
const hasBoundarySuggestions = computed(() => mode === "premise" && (suggestions.value as Suggestion[]).some(
  (proposal) => "text" in proposal && "kind" in proposal && BOUNDARY_KINDS.includes(proposal.kind),
));

function toggleSteer() {
  if (!showSteer.value && mode === "premise" && steer.value.trim() === "") {
    const pitch = entries.find((entry) => entry.part === "premise" && entry.premise_kind === "pitch");
    if (pitch) steer.value = premiseEntryText(pitch.premise_kind, pitch.title, pitch.body).slice(0, AI_PROMPT_LIMIT).trimEnd();
  }
  showSteer.value = !showSteer.value;
}

async function run() {
  if (!canSpend(cost.value, textIsByok.value)) return;
  // The clues mode is the one that sends more than the steer: the secret they are for.
  const secret = secretId;
  if (mode === "clues" && secret === null) return;
  if (mode === "lore" && (lore === null || lore.title.trim() === "")) return;
  const input = mode === "clues" && secret !== null
    ? { secret_id: secret }
    : mode === "lore" && lore !== null
      ? { title: lore.title.trim(), lore_kind: lore.kind, ...(lore.entryId && lore.text.trim() !== "" ? { text: lore.text } : {}) }
      : undefined;
  const ok = await (suggest as (steer: string, input?: object) => Promise<boolean>)(steer.value, input);
  if (ok) {
    showSteer.value = false;
    steer.value = "";
  }
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isLore(s: Suggestion): s is LoreSuggestion {
  return "passages" in s;
}
function isTruth(s: Suggestion): s is TruthSuggestion {
  return "knowledge" in s;
}
function isClue(s: Suggestion): s is ClueSuggestion {
  return "spot" in s;
}
function isForce(s: Suggestion): s is ForceSuggestion {
  return "steps" in s;
}
function isQuestion(s: Suggestion): s is QuestionSuggestion {
  return !("knowledge" in s) && !("spot" in s) && !("kind" in s) && !("steps" in s) && !("passages" in s);
}

interface Proposal {
  key: string;
  source: Suggestion;
  tag: string;
  text: string;
  knowers: string[] | null;
  spot: ClueSuggestion["spot"] | null;
  who?: ForceSuggestion["who"];
  detail?: string | null;
}

const proposals = computed<Proposal[]>(() =>
  (suggestions.value as Suggestion[]).map((source, i) => {
    if (isLore(source)) return { key: `${i}:${source.title}`, source, tag: lore?.entryId ? "Passages" : "A lore entry", text: source.title, knowers: null, spot: null, detail: loreDetail(source) };
    if (isForce(source)) return { key: `${i}:${source.title}`, source, tag: "A force", text: `${source.title} wants ${source.wants}`, knowers: null, spot: null, who: source.who, detail: forceDetail(source) };
    if (isTruth(source)) return { key: `${i}:${source.title}`, source, tag: MARK_TAG[source.knowledge], text: source.title, knowers: source.knowers.map((k) => k.name), spot: null };
    if (isClue(source)) return { key: `${i}:${source.title}`, source, tag: SPOT_TAG[source.spot.kind], text: source.title, knowers: null, spot: source.spot };
    if (isQuestion(source)) return { key: `${i}:${source.title}`, source, tag: "Kept open", text: source.title, knowers: null, spot: null };
    return { key: `${i}:${source.kind}:${source.text}`, source, tag: KIND_TAG[source.kind], text: source.text, knowers: null, spot: null };
  }),
);

function loreDetail(s: LoreSuggestion): string {
  return `${s.passages.length} ${s.passages.length === 1 ? "passage" : "passages"}: ${s.passages.map((p) => p.title).join("; ")}.`;
}

function forceDetail(s: ForceSuggestion): string {
  const steps = `${s.steps.length} ${s.steps.length === 1 ? "step" : "steps"}`;
  const quests = s.quests.length > 0 ? `, in ${s.quests.map((q) => q.title).join(", ")}` : "";
  return `A clock of ${s.clockSize}, ${steps}${quests}.`;
}

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
    const oldText = premiseEntryText(existing.premise_kind, existing.title, existing.body);
    const ok = await confirm(
      `This will replace “${oldText}” with “${s.text}”; are you sure?`,
      { title: `Replace the ${s.kind}?`, confirmLabel: "Replace", danger: false },
    );
    if (!ok) return false;
    // A voice or look is carried by its title, so a body left over from the old text would be read with the new one.
    const patch = s.kind === "pitch" ? { ...field } : { ...field, body: null };
    await updateEntry({ id: existing.id, patch: { ...patch, ...stamp() } });
    return true;
  }
  if (s.kind === "line" || s.kind === "veil") {
    const ok = await confirm(
      `Accepting this ${s.kind} makes it an active rule for AI generations immediately. It stays private unless you share it. Review it with your players before accepting: “${s.text}”.`,
      { title: `Activate this ${s.kind}?`, confirmLabel: "Accept boundary", danger: false },
    );
    if (!ok) return false;
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

/** A clue lies at exactly one of the three places; only the column matching the suggested spot is set. */
async function acceptClue(s: ClueSuggestion) {
  if (secretId === null) throw new Error("Place clues is only offered on a secret.");
  const count = (allClues.value ?? []).filter((c) => c.secret_id === secretId).length;
  const base = { secret_id: secretId, title: s.title, sort_order: count, ...stamp() };
  const clue: NewCanonClue =
    s.spot.kind === "location" ? { ...base, location_id: s.spot.id }
    : s.spot.kind === "npc" ? { ...base, npc_id: s.spot.id }
    : { ...base, quest_beat_id: s.spot.id };
  await createClue(clue);
  return true;
}

async function acceptQuestion(s: QuestionSuggestion) {
  const count = entries.filter((e) => e.part === "question").length;
  await createEntry({ part: "question", title: s.title, sort_order: count, ...stamp() });
  return true;
}

async function acceptForce(s: ForceSuggestion) {
  await writeForce(s, provenance.value, entries.filter((e) => e.part === "force").length);
  return true;
}

/** A draft writes a whole entry; a split keeps the entry and, once the DM agrees, replaces its passages. */
async function acceptLore(s: LoreSuggestion) {
  if (lore?.entryId) {
    const existing = (allPassages.value ?? []).filter((p) => p.entry_id === lore.entryId);
    const { replace, kept } = splitReplacement(existing, new Set((allClues.value ?? []).flatMap((c) => (c.passage_id === null ? [] : [c.passage_id]))));
    if (existing.length > 0) {
      const keeps = kept.length === 0 ? "" : ` ${kept.length === 1 ? "One passage stays" : `${kept.length} passages stay`}, since it is already told or a clue points at it; the new ones come after.`;
      const gone = replace.length === 0 ? "Nothing is replaced." : `Replace ${replace.length === 1 ? "this entry's untold passage" : `this entry's ${replace.length} untold passages`} with the split?`;
      const ok = await confirm(`${gone}${keeps}`, { title: "Split into passages", confirmLabel: replace.length === 0 ? "Add the split" : "Replace" });
      if (!ok) return false;
    }
    await acceptLoreWrites.split(s, lore.entryId, provenance.value, existing, replace);
    return true;
  }
  const count = entries.filter((e) => e.part === "lore").length;
  emit("accepted", await acceptLoreWrites.draft(s, provenance.value, count));
  return true;
}

async function accept(s: Suggestion) {
  isAccepting.value = true;
  try {
    const done = isLore(s) ? await acceptLore(s) : isForce(s) ? await acceptForce(s) : isTruth(s) ? await acceptTruth(s) : isClue(s) ? await acceptClue(s) : isQuestion(s) ? await acceptQuestion(s) : await acceptPremise(s);
    if (done) dismiss(s as never);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not save that suggestion.");
  } finally {
    isAccepting.value = false;
  }
}
</script>
