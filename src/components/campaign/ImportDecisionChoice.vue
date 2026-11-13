<template>
  <div role="radiogroup" :aria-label="`Choose what happens to ${heading}`" class="space-y-2">
    <label v-for="(candidate, idx) in candidates" :key="candidate.source + candidate.targetId" :class="OPTION_CLASS">
      <input
        type="radio"
        :name="groupName"
        class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        :checked="isSelectedCandidate(candidate)"
        @change="decision = { action: 'link', candidate }"
      />
      <span class="min-w-0 flex-1 space-y-0.5">
        <span class="flex flex-wrap items-baseline gap-1.5">
          <span class="text-body font-semibold text-foreground">{{ candidateLetter(idx) }}. {{ candidate.name }}</span>
          <span class="text-caption text-muted-foreground">{{ sourceText(candidate) }}</span>
          <span class="text-caption text-muted-foreground">· {{ matchKindHint(candidate.matchKind) }}</span>
        </span>
        <span v-if="candidate.detail" class="block text-caption text-muted-foreground">{{ candidate.detail }}</span>
      </span>
    </label>

    <label v-if="pickedByHand" :class="OPTION_CLASS">
      <input type="radio" :name="groupName" class="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked />
      <span class="min-w-0 flex-1 space-y-0.5">
        <span class="flex flex-wrap items-baseline gap-1.5">
          <span class="text-body font-semibold text-foreground">{{ pickedByHand.name }}</span>
          <span class="text-caption text-muted-foreground">{{ sourceText(pickedByHand) }}</span>
          <span class="text-caption text-muted-foreground">· picked by you</span>
        </span>
        <span v-if="pickedByHand.detail" class="block text-caption text-muted-foreground">{{ pickedByHand.detail }}</span>
      </span>
    </label>

    <label v-if="showCreate" :class="OPTION_CLASS">
      <input
        type="radio"
        :name="groupName"
        class="h-4 w-4 shrink-0 accent-primary"
        :checked="decision.action === 'create'"
        @change="decision = { action: 'create' }"
      />
      <span class="text-body text-foreground">Create new</span>
    </label>

    <label v-if="showGenerate" :class="OPTION_CLASS">
      <input
        type="radio"
        :name="groupName"
        class="h-4 w-4 shrink-0 accent-primary"
        :checked="decision.action === 'generate'"
        @change="decision = { action: 'generate' }"
      />
      <span class="text-body text-foreground">
        Generate with the Monster Generator<template v-if="generateCreditsLabel"> · {{ generateCreditsLabel }}</template>
      </span>
    </label>

    <label :class="OPTION_CLASS">
      <input
        type="radio"
        :name="groupName"
        class="h-4 w-4 shrink-0 accent-primary"
        :checked="decision.action === 'ignore'"
        @change="decision = { action: 'ignore' }"
      />
      <span class="min-w-0 flex-1 space-y-0.5">
        <span class="block text-body text-foreground">Ignore</span>
        <span class="block text-caption text-muted-foreground">Not imported, and mentions of it on this page aren't linked.</span>
      </span>
    </label>

    <template v-if="searchKind && searchKind !== 'quests'">
      <ImportLinkPicker
        v-if="pickerOpen"
        :kind="searchKind"
        @pick="(c) => (decision = { action: 'link', candidate: c })"
        @close="pickerOpen = false"
      />
      <AppButton v-else variant="ghost" size="sm" label="Link to something else…" @click="pickerOpen = true" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The choice an import review offers for one entity: link to each candidate
 * (lettered A, B, C…), Create new, Generate (monsters only), Ignore. A native
 * radio group (CLAUDE.md's raw-input exception: radios have no primitive, and
 * the definition of the decision belongs to `entityMatching.ts`, not here).
 *
 * Extracted from `ImportEntityReviewRow.vue` so the wiki-export review (#932),
 * which has no generate option and no field editor, offers the very same
 * choice instead of a second copy of it.
 */
import { candidateLetter, matchKindHint } from "@/lib/documentImport/reviewDecisions";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ImportLinkPicker from "@/components/campaign/ImportLinkPicker.vue";
import type { ImportEntityKind } from "@/types/documentImport.types";

const {
  heading,
  groupName,
  candidates = [],
  showCreate = true,
  showGenerate = false,
  generateCreditsLabel = null,
  searchKind = null,
} = defineProps<{
  /** The entity's name, for the group's accessible label. */
  heading: string;
  /** A name unique to this entity's group, so its radios do not join another's. */
  groupName: string;
  candidates?: readonly EntityCandidate[];
  showCreate?: boolean;
  showGenerate?: boolean;
  generateCreditsLabel?: string | null;
  /** The kind of entity to search by hand for ("Link to something else…"); null offers no search. */
  searchKind?: ImportEntityKind | null;
}>();

const decision = defineModel<ImportDecision>({ required: true });
const pickerOpen = ref(false);

const OPTION_CLASS =
  "flex items-start gap-3 rounded-md border border-border p-2.5 cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5";

function sameTarget(a: EntityCandidate, b: EntityCandidate): boolean {
  return a.source === b.source && a.targetId === b.targetId;
}

/** A link the DM searched for themselves: chosen, but not one the matcher offered. */
const pickedByHand = computed<EntityCandidate | null>(() => {
  const d = decision.value;
  if (d.action !== "link") return null;
  return candidates.some((c) => sameTarget(c, d.candidate)) ? null : d.candidate;
});

function sourceText(candidate: EntityCandidate): string {
  if (candidate.source === "deity") return "your deity";
  return candidate.source === "campaign" ? "yours" : "use library entry";
}

function isSelectedCandidate(candidate: EntityCandidate): boolean {
  const d = decision.value;
  return d.action === "link" && d.candidate.source === candidate.source && d.candidate.targetId === candidate.targetId;
}
</script>
