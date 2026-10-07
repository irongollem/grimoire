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
          <span class="text-caption text-muted-foreground">{{ candidate.source === "campaign" ? "yours" : "use library entry" }}</span>
          <span class="text-caption text-muted-foreground">· {{ matchKindHint(candidate.matchKind) }}</span>
        </span>
        <span v-if="candidate.detail" class="block text-caption text-muted-foreground">{{ candidate.detail }}</span>
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
      <span class="text-body text-foreground">Ignore</span>
    </label>
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

const {
  heading,
  groupName,
  candidates = [],
  showCreate = true,
  showGenerate = false,
  generateCreditsLabel = null,
} = defineProps<{
  /** The entity's name, for the group's accessible label. */
  heading: string;
  /** A name unique to this entity's group, so its radios do not join another's. */
  groupName: string;
  candidates?: readonly EntityCandidate[];
  showCreate?: boolean;
  showGenerate?: boolean;
  generateCreditsLabel?: string | null;
}>();

const decision = defineModel<ImportDecision>({ required: true });

const OPTION_CLASS =
  "flex items-start gap-3 rounded-md border border-border p-2.5 cursor-pointer transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5";

function isSelectedCandidate(candidate: EntityCandidate): boolean {
  const d = decision.value;
  return d.action === "link" && d.candidate.source === candidate.source && d.candidate.targetId === candidate.targetId;
}
</script>
