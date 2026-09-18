<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-heading-sm font-bold text-foreground">{{ label }} · {{ entities.length }} found</h3>
        <p v-if="tallyLine" class="text-caption text-muted-foreground">{{ tallyLine }}</p>
      </div>
      <div v-if="entities.length > 0 && matchesReady" class="flex items-center gap-2">
        <AppButton variant="ghost" size="inline" label="Reset to suggested" @click="resetToSuggested" />
        <AppButton variant="ghost" size="inline" tone="danger" label="Ignore all" @click="ignoreAll" />
      </div>
    </div>

    <p v-if="droppedCount > 0" class="text-caption text-muted-foreground">
      {{ droppedCount }} {{ droppedCount === 1 ? "entry" : "entries" }} in this section couldn't be read and
      {{ droppedCount === 1 ? "was" : "were" }} skipped.
    </p>

    <p v-if="entities.length === 0" class="text-caption italic text-muted-foreground">
      This document didn't yield any {{ label.toLowerCase() }}.
    </p>

    <p v-else-if="!matchesReady" class="text-caption italic text-muted-foreground">
      Checking your campaign and the shared library for matches…
    </p>

    <div v-else class="space-y-2">
      <ImportEntityReviewRow
        v-for="entity in entities"
        :key="entity.ref"
        :entry="entry"
        :entity-ref="entity.ref"
        :page="entity.page"
        :confidence="entity.confidence"
        :candidates="candidatesByRef.get(entity.ref) ?? []"
        :generate-credits="entry.kind === 'monsters' ? generateCredits : null"
        :data="editsFor(entity)"
        :decision="decisionFor(entity)"
        @update:data="(v: Record<string, unknown>) => edits.set(entity.ref, v)"
        @update:decision="(v: ImportDecision) => decisions.set(entity.ref, v)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * One entity kind's whole review group — the header ("NPCs · 11 found"),
 * tally chips, group actions (Ignore all / Reset to suggested), and the
 * accordion of `ImportEntityReviewRow`s. Used identically by
 * `DocumentImportWizard.vue` (one per step) and `QuestPasteImportPanel.vue`
 * (one per "also found" group) — see `context/features/document-import.md`.
 *
 * Decision/edit state is owned by the CALLER (a `Map` per kind, reactive —
 * see the `defineModel` doc comments below for why mutating it in place is
 * the intended idiom) so both surfaces can read the same maps back when they
 * build the import sweep's input. This component's own job is: seed a
 * default decision the moment real candidates are known (never re-seeding
 * over a DM's own choice — `reviewDecisions.ts`), compute the tallies, and
 * wire the two bulk actions.
 */
import { computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import ImportEntityReviewRow from "@/components/campaign/ImportEntityReviewRow.vue";
import { useMonsterGenerationCost } from "@/composables/monsters/useMonsterGenerationCost";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import { ignoreAllDecisions, resetToSuggestedDecisions, seedImportDecisions, tallyDecisions } from "@/lib/documentImport/reviewDecisions";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import type { ImportEntityKind } from "@/types/documentImport.types";

const {
  kind,
  entities,
  label,
  candidatesByRef = new Map<string, EntityCandidate[]>(),
  matchesReady,
  droppedCount = 0,
} = defineProps<{
  kind: ImportEntityKind;
  entities: readonly UsableEntity[];
  label: string;
  candidatesByRef?: ReadonlyMap<string, readonly EntityCandidate[]>;
  /** True only once the shared `import-match` call has SUCCEEDED — not merely
   *  settled. A failed check must not count as "no matches": seeding then
   *  locks every entity onto "create", and because seeding never overwrites a
   *  choice already made, a successful Retry would leave them there — the
   *  silent-duplicate flow this review exists to prevent. */
  matchesReady: boolean;
  droppedCount?: number;
}>();

const entry = computed(() => getEntityKindEntry(kind));

/** One `Map<ref, ImportDecision>` for this kind, owned by the caller and
 *  mutated in place: `defineModel` wraps a `Map` in Vue's `reactive()` the
 *  same way it does any object, so `.set()` here is tracked exactly like a
 *  plain property write — see `reviewDecisions.ts`'s own doc comment on why
 *  seeding never replaces an entry that's already there. */
const decisions = defineModel<Map<string, ImportDecision>>("decisions", { required: true });
/** One `Map<ref, data>` of the (possibly DM-edited) payload per entity,
 *  falling back to the entity's own extracted data until first edited. */
const edits = defineModel<Map<string, Record<string, unknown>>>("edits", { required: true });

function editsFor(entity: UsableEntity): Record<string, unknown> {
  return edits.value.get(entity.ref) ?? entity.data;
}
function decisionFor(entity: UsableEntity): ImportDecision {
  // Only reached once `seedImportDecisions` below has run — see the
  // `v-else-if="!matchesReady"` branch in the template, which withholds the
  // row list (and so this call) until seeding has had a chance to happen.
  return decisions.value.get(entity.ref) ?? { action: "ignore" };
}

// Seeds only once matching has succeeded — see `seedImportDecisions`'s own
// doc comment: seeding against an empty candidate list before the real one
// arrives (or instead of it, when the check failed) would lock every entity
// onto "create" and never revisit it once real candidates show up.
watch(
  () => [matchesReady, entities, candidatesByRef] as const,
  ([ready]) => {
    if (!ready) return;
    const seeded = seedImportDecisions(kind, entities, candidatesByRef, decisions.value);
    if (seeded !== decisions.value) decisions.value = seeded;
  },
  { immediate: true },
);

const tally = computed(() => tallyDecisions(entities.map((e) => e.ref), decisions.value));
const tallyLine = computed(() => {
  const t = tally.value;
  const parts: string[] = [];
  if (t.link > 0) parts.push(`${t.link} link${t.link === 1 ? "" : "s"}`);
  if (t.adopt > 0) parts.push(`${t.adopt} added from library`);
  if (t.create > 0) parts.push(`${t.create} new`);
  if (t.generate > 0) parts.push(`${t.generate} generate${t.generate === 1 ? "" : "s"}`);
  if (t.ignore > 0) parts.push(`${t.ignore} ignored`);
  return parts.join(" · ");
});

function ignoreAll(): void {
  decisions.value = ignoreAllDecisions(entities);
}
function resetToSuggested(): void {
  decisions.value = resetToSuggestedDecisions(kind, entities, candidatesByRef, edits.value);
}

// ── Monster generation cost ──────────────────────────────────────────────
// Mirrors MonsterGeneratorPanel.vue's own credit formula exactly — the same
// generation, the same provider, so the same cost. Computed here (rather
// than in each row) because it's one number per campaign/provider, not per
// entity, and this is the one place both review surfaces already share.
const { credits: generateCredits } = useMonsterGenerationCost();
</script>
