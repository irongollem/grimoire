<template>
  <div v-if="visible" class="flex flex-col gap-2" :data-testid="`canon-review-${mode}`">
    <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    <div v-if="isGenerating" class="space-y-2" role="status" aria-live="polite">
      <p class="flex items-center gap-2 text-caption italic text-muted-foreground">
        <BannerLoader class="h-4" />
        {{ copy.waiting }}
      </p>
      <ListSkeleton variant="text" :count="3" />
    </div>

    <!-- The read's findings: a list to read, never to accept. Nothing in it is written. -->
    <div v-if="mode === 'read' && hasResult" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" data-testid="read-through-findings">
      <div class="flex items-center justify-between">
        <div class="text-label-lg font-semibold text-muted-foreground">{{ copy.heading }}</div>
        <AppButton variant="subtle" size="sm" label="Close" @click="dismissAll" />
      </div>
      <p class="text-caption text-muted-foreground">Nothing is saved or changed. Open an entry to fix what you agree with.</p>
      <p v-if="findings.length === 0" class="text-body italic text-muted-foreground" data-testid="read-through-clear">
        Nothing contradicts and nothing is loose.
      </p>
      <div v-for="(f, i) in findings" :key="`${i}:${f.text}`" class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3" data-testid="read-through-finding">
        <span class="text-eyebrow text-muted-foreground">{{ FINDING_TAG[f.kind] }}</span>
        <p class="text-body text-foreground">{{ f.text }}</p>
        <ul class="flex flex-wrap gap-1.5">
          <li v-for="id in f.entry_ids" :key="id">
            <RouterLink
              :to="`/canon?entry=${id}`"
              class="inline-flex items-center border border-border bg-muted/40 px-2 py-px text-label text-foreground hover:underline"
            >{{ titleOf(id) }}</RouterLink>
          </li>
        </ul>
      </div>
      <p v-for="a in setAside" :key="`aside:${a.claim}`" class="text-caption italic text-muted-foreground">
        Set aside: "{{ a.claim }}". {{ capitalised(a.reason) }}.
      </p>
    </div>

    <div v-else-if="proposals.length > 0 || setAside.length > 0" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div class="flex items-center justify-between">
        <div class="text-label-lg font-semibold text-muted-foreground">{{ copy.heading }}</div>
        <AppButton variant="subtle" size="sm" label="Dismiss all" @click="dismissAll" />
      </div>
      <p class="text-caption text-muted-foreground">Nothing is saved until you accept one. An accepted entry carries the AI label until you change it.</p>
      <p v-if="hasBoundarySuggestions" class="text-caption text-muted-foreground">Accepting a line or veil makes it an active rule for AI generations immediately. It stays private until you share it; review it with your players before accepting.</p>
      <div v-for="p in proposals" :key="p.key" class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3" data-testid="canon-proposal">
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
 * Where the Familiar's canon suggestions land (#1267). The Canon has no AI of its own: a Suggest button opens Ask
 * Grimoire, which runs the helper and keeps its result in `useCanonSuggestions`' module state, keyed by mode (and scope).
 * This is the review of that state, mounted by the chapter or entry the suggestions belong to: proposals one by one with
 * Accept and Dismiss, and, for `read`, the findings to read. Nothing is written until the DM accepts; an accepted entry
 * carries the run's `ai_provenance`. Renders nothing when its key holds no result, no error and no run in flight.
 */
import { computed, ref } from "vue";
import { IconCheck } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import CanonRef from "./CanonRef.vue";
import { KNOWLEDGE_LABEL, plainTextToTiptap } from "@/lib/canon/canonParts";
import { useCanonClues, useCreateCanonClue, type NewCanonClue } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useAcceptForce } from "@/composables/canon/useCanonForces";
import { splitReplacement, useAcceptLore } from "@/composables/canon/useAcceptLore";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useKnownTo } from "@/composables/canon/useKnownTo";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCanonSuggestions, type CanonSuggestionMode, type ClueSuggestion, type ForceSuggestion, type LoreSuggestion, type PremiseSuggestion, type QuestionSuggestion, type ReadFinding, type SecretSuggestion, type TruthSuggestion } from "@/ai/useCanonSuggestions";
import type { AiProvenance } from "@/ai/provenance";
import { premiseEntryText } from "@edge-shared/worldBlock.ts";
import type { CanonEntry, LoreKind, PremiseKind } from "@/types/canon.types";

type Suggestion = PremiseSuggestion | TruthSuggestion | ClueSuggestion | QuestionSuggestion | ForceSuggestion | LoreSuggestion | SecretSuggestion;

const { mode, entries = [], secretId = null, lore = null, scope = undefined } = defineProps<{
  mode: CanonSuggestionMode;
  /** The entries the mode adds to: premise entries, truths, forces, secrets, questions or lore. Not needed by `clues` or `read`. */
  entries?: readonly CanonEntry[];
  /** Required by `clues`: the secret the clues are for. */
  secretId?: string | null;
  /**
   * Required by `lore`: the title and kind of the entry. With an `entryId` the proposals are that entry's text split
   * into passages, which replace its passages; without one they are whole new lore entries.
   */
  lore?: { title: string; kind: LoreKind | null; entryId: string | null; text: string } | null;
  /** Overrides the key the proposals are held under; the default is the secret's or lore entry's id, or none. */
  scope?: string;
}>();
// Emitted with the entry an accept created and the page may open: a lore draft, or a secret.
const emit = defineEmits<{ accepted: [entryId: string] }>();

const COPY = {
  premise: { heading: "Suggested premise entries", waiting: "Reading your campaign and your pitch. This takes a little while." },
  truths: { heading: "Suggested truths", waiting: "Reading your campaign for truths. This takes a little while." },
  clues: { heading: "Suggested clues", waiting: "Reading your campaign for places to put clues. This takes a little while." },
  questions: { heading: "Suggested questions", waiting: "Reading your campaign for questions to keep open. This takes a little while." },
  forces: { heading: "Suggested forces", waiting: "Reading your campaign for what could be moving. This takes a little while." },
  lore: { heading: "Suggested lore", waiting: "Reading your campaign to draft this lore. This takes a little while." },
  secrets: { heading: "Suggested secrets", waiting: "Reading your campaign for secrets and places to hide clues. This takes a little while." },
  split: { heading: "Suggested passages", waiting: "Reading the entry to split it into passages. This takes a little while." },
  read: { heading: "What the read found", waiting: "Reading the whole canon for what does not hold together. This takes a little while." },
} as const;
const copy = computed(() => (mode === "lore" && lore?.entryId ? COPY.split : COPY[mode]));
const FINDING_TAG = { contradiction: "Contradiction", loose_end: "Loose end" } as const;

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
const MARK_TAG = KNOWLEDGE_LABEL;

const toast = useToast();
const { confirm } = useConfirm();

// The key the adapter writes under: the Familiar stores a clue run under its secret and a split under its entry.
const { suggestions, setAside, provenance, isGenerating, hasResult, error, dismiss, dismissAll } = useCanonSuggestions(mode, scope ?? (mode === "clues" ? (secretId ?? undefined) : mode === "lore" ? (lore?.entryId ?? "new") : undefined));

const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: createClue } = useCreateCanonClue();
const { data: allClues } = useCanonClues(() => mode === "clues" || mode === "lore");
const { mutateAsync: updateEntry } = useUpdateCanonEntry();
const writeForce = useAcceptForce();
const acceptLoreWrites = useAcceptLore();
const { data: allPassages } = useCanonPassages(() => mode === "lore");
// No entry yet: only `nameKnower`, which takes the new truth's id, is used.
const { nameKnower } = useKnownTo(() => null);

const isAccepting = ref(false);
const hasBoundarySuggestions = computed(() => mode === "premise" && (suggestions.value as Suggestion[]).some(
  (proposal) => "text" in proposal && "kind" in proposal && BOUNDARY_KINDS.includes(proposal.kind),
));

// The read's findings name entries by id; their titles come from the whole canon.
const { data: canon } = useCanonEntries({ enabled: () => mode === "read" });
const findings = computed(() => (mode === "read" ? (suggestions.value as ReadFinding[]) : []));
const titles = computed(() => new Map((canon.value ?? []).map((e) => [e.id, e.title.trim()])));
const titleOf = (id: string) => {
  const title = titles.value.get(id);
  return title === undefined || title === "" ? "An entry" : title;
};

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
function isSecret(s: Suggestion): s is SecretSuggestion {
  return "clues" in s;
}
function isQuestion(s: Suggestion): s is QuestionSuggestion {
  return !("knowledge" in s) && !("spot" in s) && !("kind" in s) && !("steps" in s) && !("passages" in s) && !("clues" in s);
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
  (mode === "read" ? [] : (suggestions.value as Suggestion[])).map((source, i) => {
    if (isSecret(source)) return { key: `${i}:${source.title}`, source, tag: "A secret", text: source.title, knowers: null, spot: null, detail: secretDetail(source) };
    if (isLore(source)) return { key: `${i}:${source.title}`, source, tag: lore?.entryId ? "Passages" : "A lore entry", text: source.title, knowers: null, spot: null, detail: loreDetail(source) };
    if (isForce(source)) return { key: `${i}:${source.title}`, source, tag: "A force", text: `${source.title} wants ${source.wants}`, knowers: null, spot: null, who: source.who, detail: forceDetail(source) };
    if (isTruth(source)) return { key: `${i}:${source.title}`, source, tag: MARK_TAG[source.knowledge], text: source.title, knowers: source.knowers.map((k) => k.name), spot: null };
    if (isClue(source)) return { key: `${i}:${source.title}`, source, tag: SPOT_TAG[source.spot.kind], text: source.title, knowers: null, spot: source.spot };
    if (isQuestion(source)) return { key: `${i}:${source.title}`, source, tag: "Kept open", text: source.title, knowers: null, spot: null };
    return { key: `${i}:${source.kind}:${source.text}`, source, tag: KIND_TAG[source.kind], text: source.text, knowers: null, spot: null };
  }),
);

const visible = computed(() => error.value !== null || isGenerating.value || (mode === "read" ? hasResult.value : proposals.value.length > 0 || setAside.value.length > 0));

function secretDetail(s: SecretSuggestion): string {
  return `${s.clues.length === 1 ? "A clue" : `${s.clues.length} clues`}: ${s.clues.map((c) => (c.spot ? `${c.title} (at ${c.spot.name})` : c.title)).join("; ")}.`;
}

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

/** A clue lies at exactly one of the three places, or nowhere yet; only the column matching the spot is set. */
function clueAt(secret: string, title: string, sort_order: number, spot: ClueSuggestion["spot"] | null): NewCanonClue {
  const base = { secret_id: secret, title, sort_order, ...stamp() };
  if (spot === null) return base;
  return spot.kind === "location" ? { ...base, location_id: spot.id }
    : spot.kind === "npc" ? { ...base, npc_id: spot.id }
    : { ...base, quest_beat_id: spot.id };
}

async function acceptClue(s: ClueSuggestion) {
  if (secretId === null) throw new Error("Place clues is only offered on a secret.");
  const count = (allClues.value ?? []).filter((c) => c.secret_id === secretId).length;
  await createClue(clueAt(secretId, s.title, count, s.spot));
  return true;
}

/**
 * A secret and its clues, written in turn: the clues need the secret's id. One that fails stops the rest and tells the
 * DM (the caller's toast); the secret and the clues already made stay, and the proposal stays to accept again.
 */
async function acceptSecret(s: SecretSuggestion) {
  const count = entries.filter((e) => e.part === "secret").length;
  const created = await createEntry({ part: "secret", title: s.title, sort_order: count, ...stamp() });
  for (const [i, clue] of s.clues.entries()) await createClue(clueAt(created.id, clue.title, i, clue.spot));
  emit("accepted", created.id);
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
    const done = isSecret(s) ? await acceptSecret(s) : isLore(s) ? await acceptLore(s) : isForce(s) ? await acceptForce(s) : isTruth(s) ? await acceptTruth(s) : isClue(s) ? await acceptClue(s) : isQuestion(s) ? await acceptQuestion(s) : await acceptPremise(s);
    if (done) dismiss(s as never);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not save that suggestion.");
  } finally {
    isAccepting.value = false;
  }
}
</script>
