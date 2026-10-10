<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h3 class="text-heading-sm font-semibold text-foreground">Review</h3>
      <p class="text-caption text-muted-foreground">
        Pages that match something you already have are linked rather than copied. Nothing is created until you press Import,
        and everything arrives for you only.
      </p>
    </div>

    <div v-if="matches.error.value" class="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p class="text-caption text-destructive">
        Couldn't check your campaign for entries you already have. Nothing is imported until that check has run.
      </p>
      <AppButton variant="subtle" size="inline" label="Retry" @click="matches.refetch()" />
    </div>
    <p v-else-if="matches.isLoading.value" class="text-caption italic text-muted-foreground">
      Checking your campaign for matches…
    </p>

    <template v-else>
      <section v-for="section in sections" :key="section.kind" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <h4 class="text-heading-sm font-bold text-foreground">{{ ARCHIVE_KIND_PLURALS[section.kind] }} · {{ section.entries.length }}</h4>
            <p v-if="tallyLine(section.kind)" class="text-caption text-muted-foreground">{{ tallyLine(section.kind) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton variant="ghost" size="inline" label="Reset to suggested" @click="resetKind(section.kind)" />
            <AppButton variant="ghost" size="inline" tone="danger" label="Ignore all" @click="ignoreKind(section.kind)" />
          </div>
        </div>
        <div class="space-y-2">
          <ArchiveReviewRow
            v-for="entry in section.entries.slice(0, shownCount(section.kind))"
            :key="entry.page.ref"
            :page="entry.page"
            :kind="section.kind"
            :decision="decisionFor(entry.page.ref)"
            :candidates="candidatesFor(section.kind, entry.page.ref)"
            @update:decision="(d: ArchiveDecision) => setDecision(entry.page.ref, d)"
          />
        </div>
        <AppButton
          v-if="section.entries.length > shownCount(section.kind)"
          variant="ghost"
          size="inline"
          :label="`Show ${Math.min(ROW_STEP, section.entries.length - shownCount(section.kind))} more of ${section.entries.length - shownCount(section.kind)}`"
          @click="showMore(section.kind)"
        />
      </section>

      <ImportQuotaWarning :shortfalls="shortfalls" />
      <p v-if="sweepError" class="text-caption text-destructive">{{ sweepError }}</p>
      <p v-if="progressLabel" class="text-caption text-muted-foreground">{{ progressLabel }}</p>
    </template>

    <div class="flex items-center justify-between gap-2 border-t border-border pt-3">
      <AppButton variant="subtle" size="md" label="Cancel import" :disabled="isSweeping" @click="emit('cancel')" />
      <AppButton
        variant="primary"
        size="md"
        :label="`Import ${toCreate} ${toCreate === 1 ? 'record' : 'records'}`"
        :icon="IconUpload"
        :loading="isSweeping"
        :disabled="isSweeping || matches.isLoading.value || !!matches.error.value || quotaLoading || shortfalls.length > 0 || decisions.size === 0"
        @click="runImport"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The review of a wiki-export import (#932), after the DM has sorted the pages:
 * per kind, one row per page with the dedupe candidates `import-match` found
 * and a link / create / ignore decision. There is no generate option and no
 * field editor; the body is kept whole. The AI import's wizard is not reused
 * here because it is shaped around model output (it refuses a row without AI
 * provenance and caps prose); the parts that are common, the decision control
 * and the status chip, are shared (`ImportDecisionChoice`, `decisionStatus`).
 *
 * The page bodies live in this component's props, in memory, and nowhere else:
 * the row holds only the manifest.
 */
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ArchiveReviewRow from "@/components/campaign/ArchiveReviewRow.vue";
import ImportQuotaWarning from "@/components/campaign/ImportQuotaWarning.vue";
import { IconUpload } from "@/lib/icons";
import { useArchiveEntityMatches, useRunArchiveSweep, type ArchiveSweepRun } from "@/composables/campaign/useArchiveImport";
import { useImportQuotaRoom } from "@/composables/campaign/useImportQuotaRoom";
import { entitiesForMatching, IMPORT_KIND_FOR_PAGE_KIND } from "@/lib/archiveImport/archiveMatches";
import {
  ARCHIVE_CREATE_ORDER,
  type ArchiveDecision,
  type ArchiveRecordKind,
  type ArchiveSweepEntry,
  type ArchiveSweepProgress,
} from "@/lib/archiveImport/archiveSweep";
import { ARCHIVE_KIND_PLURALS } from "@/lib/archiveImport/sortGroups";
import type { ArchivePage, ArchivePageKind } from "@/lib/archiveImport/types";
import { defaultDecision, type EntityCandidate, type ImportDecision } from "@/lib/documentImport/entityMatching";
import { quotaShortfalls, rowsAddedToQuota } from "@/lib/documentImport/reviewDecisions";
import type { ArchiveDocumentImport, ImportEntityKind } from "@/types/documentImport.types";

const { importRow, pages, kinds } = defineProps<{
  importRow: ArchiveDocumentImport;
  /** Every page of the export, in memory. */
  pages: readonly ArchivePage[];
  /** The DM's settled kind per page `ref`. */
  kinds: ReadonlyMap<string, ArchivePageKind>;
}>();
const emit = defineEmits<{ done: [run: ArchiveSweepRun]; cancel: [] }>();

const ROW_STEP = 50;

/** A page that is not skipped, with the kind the DM settled. */
interface ReviewEntry {
  page: ArchivePage;
  kind: ArchiveRecordKind;
}
const entries = computed<ReviewEntry[]>(() =>
  pages.flatMap((page): ReviewEntry[] => {
    const kind = kinds.get(page.ref) ?? page.kind;
    return kind === "skip" ? [] : [{ page, kind }];
  }),
);
const sections = computed(() =>
  ARCHIVE_CREATE_ORDER.map((kind) => ({ kind, entries: entries.value.filter((e) => e.kind === kind) })).filter((s) => s.entries.length > 0),
);

// ── Dedupe candidates ────────────────────────────────────────────────────────

const matchEntities = computed(() => entitiesForMatching(entries.value));
const matches = useArchiveEntityMatches(() => importRow.id, matchEntities);

function candidatesFor(kind: ArchiveRecordKind, ref: string): readonly EntityCandidate[] {
  const importKind = IMPORT_KIND_FOR_PAGE_KIND[kind];
  return importKind ? (matches.candidatesByKind.value.get(importKind)?.get(ref) ?? []) : [];
}

// ── Decisions ────────────────────────────────────────────────────────────────

const decisions = reactive(new Map<string, ArchiveDecision>());

/** Nothing here can be `generate` (monsters are never an archive kind); a stray one is read as create. */
function asArchiveDecision(decision: ImportDecision): ArchiveDecision {
  return decision.action === "generate" ? { action: "create" } : decision;
}

function suggestedFor(entry: ReviewEntry): ArchiveDecision {
  const importKind = IMPORT_KIND_FOR_PAGE_KIND[entry.kind];
  if (!importKind) return { action: "create" };
  return asArchiveDecision(defaultDecision(importKind, {}, candidatesFor(entry.kind, entry.page.ref)));
}

// Seeded only once the candidates are known, and never over a choice the DM has made.
watch(
  () => [matches.isLoading.value, matches.error.value, entries.value, matches.candidatesByKind.value] as const,
  ([loading, error]) => {
    if (loading || error) return;
    for (const entry of entries.value) {
      if (!decisions.has(entry.page.ref)) decisions.set(entry.page.ref, suggestedFor(entry));
    }
  },
  { immediate: true },
);

function decisionFor(ref: string): ArchiveDecision {
  return decisions.get(ref) ?? { action: "ignore" };
}
function setDecision(ref: string, decision: ArchiveDecision): void {
  decisions.set(ref, decision);
}
function ignoreKind(kind: ArchiveRecordKind): void {
  for (const entry of entries.value) if (entry.kind === kind) decisions.set(entry.page.ref, { action: "ignore" });
}
function resetKind(kind: ArchiveRecordKind): void {
  for (const entry of entries.value) if (entry.kind === kind) decisions.set(entry.page.ref, suggestedFor(entry));
}

function tallyLine(kind: ArchiveRecordKind): string {
  const t = { link: 0, create: 0, ignore: 0 };
  for (const entry of entries.value) {
    if (entry.kind !== kind) continue;
    const d = decisions.get(entry.page.ref);
    if (d) t[d.action]++;
  }
  return [t.link > 0 ? `${t.link} link${t.link === 1 ? "" : "s"}` : null, t.create > 0 ? `${t.create} new` : null, t.ignore > 0 ? `${t.ignore} ignored` : null]
    .filter((p): p is string => p !== null)
    .join(" · ");
}

// ── Long lists render a step at a time ───────────────────────────────────────

const shown = ref(new Map<ArchiveRecordKind, number>());
function shownCount(kind: ArchiveRecordKind): number {
  return shown.value.get(kind) ?? ROW_STEP;
}
function showMore(kind: ArchiveRecordKind): void {
  const next = new Map(shown.value);
  next.set(kind, shownCount(kind) + ROW_STEP);
  shown.value = next;
}

// ── Plan limits, checked before anything is written ─────────────────────────

const toCreate = computed(() => [...decisions.values()].filter((d) => d.action === "create").length);

const quotaAdds = computed(() => {
  const adds: Partial<Record<ImportEntityKind, number>> = {};
  for (const entry of entries.value) {
    const importKind = IMPORT_KIND_FOR_PAGE_KIND[entry.kind];
    if (!importKind) continue;
    const created = decisions.get(entry.page.ref)?.action === "create" ? 1 : 0;
    adds[importKind] = (adds[importKind] ?? 0) + rowsAddedToQuota({ link: 0, create: created, generate: 0, ignore: 0 });
  }
  return adds;
});
const { roomFor, isLoading: quotaLoading } = useImportQuotaRoom();
const shortfalls = computed(() => quotaShortfalls(quotaAdds.value, roomFor.value));

// ── The sweep ────────────────────────────────────────────────────────────────

const { runSweep } = useRunArchiveSweep();
const isSweeping = ref(false);
const sweepError = ref<string | null>(null);
const progress = ref<ArchiveSweepProgress | null>(null);
const progressLabel = computed(() => {
  const p = progress.value;
  if (!p) return "";
  return p.phase === "linking" ? `Linking pages ${p.done}/${p.total}…` : `Importing ${p.done}/${p.total}…`;
});

async function runImport(): Promise<void> {
  if (isSweeping.value) return;
  isSweeping.value = true;
  sweepError.value = null;
  progress.value = null;
  try {
    const sweepEntries: ArchiveSweepEntry[] = entries.value.map((entry) => ({ page: entry.page, kind: entry.kind, decision: decisionFor(entry.page.ref) }));
    const run = await runSweep(importRow, { entries: sweepEntries, allPages: pages }, (p) => {
      progress.value = p;
    });
    emit("done", run);
  } catch (e) {
    sweepError.value = e instanceof Error ? e.message : "Something went wrong while importing.";
  } finally {
    isSweeping.value = false;
    progress.value = null;
  }
}
</script>
