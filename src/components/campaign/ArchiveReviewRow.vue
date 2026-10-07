<template>
  <ImportReviewCard :heading="page.title" :status="status" :region-id="regionId" :auto-expand="needsDmChoice(candidates)">
    <template #meta>
      <span v-if="folder" class="truncate text-caption text-muted-foreground">{{ folder }}</span>
    </template>

    <ImportDecisionChoice
        :model-value="decision"
        :heading="page.title"
        :group-name="`${regionId}-decision`"
        :candidates="candidates"
        :show-create="true"
        @update:model-value="onChoice"
      />

      <p v-if="page.notes.length" class="text-caption italic text-muted-foreground">{{ page.notes.join(" · ") }}</p>

      <div v-if="decision.action === 'create'" class="space-y-3">
        <p class="text-label uppercase text-muted-foreground">Will be stored as</p>
        <p v-if="!sections.length" class="text-caption italic text-muted-foreground">An empty record with just its name.</p>
        <div v-for="section in sections" :key="section.label" class="space-y-1">
          <h4 class="text-label uppercase text-muted-foreground">{{ section.label }}</h4>
          <p v-if="section.text" class="text-body text-foreground">{{ section.text }}</p>
          <RichTextViewer v-else :content="section.doc ?? null" />
        </div>
      </div>
  </ImportReviewCard>
</template>

<script setup lang="ts">
/**
 * One page's row in the wiki-export review (#932): what will happen to it
 * (link to an existing entry, create, ignore) and, expanded, the body as it
 * will be stored. The choice itself is `ImportDecisionChoice`, the same
 * control the AI import's rows use; there is no generate option and no field
 * editor, since the body is the DM's own writing and is kept whole.
 */
import { computed, useId } from "vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import ImportDecisionChoice from "@/components/campaign/ImportDecisionChoice.vue";
import ImportReviewCard from "@/components/campaign/ImportReviewCard.vue";
import { previewSections } from "@/lib/archiveImport/archivePreview";
import type { ArchiveDecision, ArchiveRecordKind } from "@/lib/archiveImport/archiveSweep";
import type { ArchivePage } from "@/lib/archiveImport/types";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";
import { decisionStatus, needsDmChoice } from "@/lib/documentImport/reviewDecisions";

const { page, kind, decision, candidates = [] } = defineProps<{
  page: ArchivePage;
  kind: ArchiveRecordKind;
  decision: ArchiveDecision;
  candidates?: readonly EntityCandidate[];
}>();
const emit = defineEmits<{ "update:decision": [decision: ArchiveDecision] }>();

const regionId = `archive-row-${useId()}`;
const folder = computed(() => page.folders.join(" / "));
const status = computed(() => decisionStatus(decision, null));

// Lazy: only the card's open body reads it, so two thousand closed rows never split a page body.
const sections = computed(() => previewSections(page, kind));

function onChoice(next: ImportDecision): void {
  // `generate` is a monster-only choice and this row never offers it.
  if (next.action === "generate") return;
  emit("update:decision", next);
}
</script>
