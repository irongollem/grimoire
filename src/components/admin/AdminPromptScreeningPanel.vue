<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Prompt Screening</h2>
        <p class="text-caption text-muted-foreground italic mt-0.5 max-w-prose">
          IMAGE_PROMPT_THRESHOLDS was set from eight test prompts. This is what real
          image-generation traffic says about it: which thresholds let something through
          that the renderer then refused anyway, and which have room to spare.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppSelect v-model.number="windowDays" size="body" aria-label="Screening window">
          <option v-for="d in PROMPT_SCREENING_WINDOWS" :key="d" :value="d">Last {{ d }} days</option>
        </AppSelect>
        <AppSelect v-model="selectedType" size="body" aria-label="Filter by surface">
          <option :value="null">All surfaces</option>
          <option v-for="t in surfaceOptions" :key="t" :value="t">{{ formatGenerationType(t) }}</option>
        </AppSelect>
        <AppButton
          v-if="hasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          @click="resetFilters"
        />
      </div>
    </div>

    <div v-if="query.isPending.value" class="text-muted-foreground text-body">
      Loading the screening log…
    </div>
    <div v-else-if="query.isError.value" class="text-destructive text-body">
      Failed to load the prompt screening log.
    </div>

    <template v-else-if="hints">
      <div
        v-if="isEmptyWindow"
        class="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center space-y-1.5"
      >
        <component :is="IconShieldCheck" class="mx-auto h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
        <p class="text-body text-foreground">No screenings recorded in the last {{ windowDays }} days.</p>
        <p class="text-caption text-muted-foreground italic">
          Every image prompt is screened before it renders — this fills in as soon as one runs.
        </p>
      </div>

      <template v-else>
        <!-- Composition: always the whole window, never narrowed by the surface filter —
             this is what a naive unfiltered percentile is silently averaging over. -->
        <div class="space-y-1.5">
          <p class="text-label-lg text-foreground">Composition — last {{ windowDays }} days</p>
          <div class="flex flex-wrap gap-1.5">
            <AppButton
              v-for="t in hints.by_type"
              :key="t.generation_type"
              variant="tinted"
              size="xs"
              tone="neutral"
              :active="selectedType === t.generation_type"
              :label="`${formatGenerationType(t.generation_type)}${isBulkGenerationType(t.generation_type) ? ' · bulk' : ''} (${t.screenings})`"
              :title="`${t.screenings} screened · ${t.blocked} blocked · ${t.refused_after_pass} refused after pass`"
              @click="selectedType = selectedType === t.generation_type ? null : t.generation_type"
            />
          </div>
          <p
            v-if="!selectedType && dominance"
            class="text-caption text-tone-caution flex items-start gap-1"
          >
            <component :is="IconWarning" class="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {{ formatGenerationType(dominance.generation_type) }} is
              {{ Math.round(dominance.share * 100) }}% of this window.
              <template v-if="dominance.bulk">
                Its prompts are templated and near-duplicate, which pulls the unfiltered
                percentiles below toward it — filter to one surface to read those cleanly.
              </template>
              <template v-else>
                The unfiltered numbers below mostly reflect this one surface already.
              </template>
            </span>
          </p>
        </div>

        <div
          v-if="isEmptyForFilter"
          class="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center space-y-1.5"
        >
          <p class="text-body text-foreground">
            No {{ formatGenerationType(selectedType!) }} screenings in the last {{ windowDays }} days.
          </p>
          <AppButton variant="subtle" size="sm" label="Clear filter" @click="resetFilters" />
        </div>

        <template v-else>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <p class="text-eyebrow text-muted-foreground">{{ stat.label }}</p>
              <p
                class="text-heading-sm font-cinzel"
                :class="stat.headline && stat.value > 0 ? 'text-tone-danger' : 'text-foreground'"
              >{{ stat.value }}</p>
            </div>
          </div>

          <div class="space-y-2">
            <div
              v-for="hint in hints.categories"
              :key="hint.category"
              class="rounded-md border border-border px-3 py-2.5 space-y-1.5"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-fell text-body text-foreground">{{ formatCategoryLabel(hint.category) }}</span>
                  <span class="text-caption-sm text-muted-foreground">threshold {{ hint.threshold }}</span>
                </div>
                <AppButton
                  as="span"
                  variant="tinted"
                  size="xs"
                  :tone="DIAGNOSIS_TONE[diagnoseCategory(hint)]"
                  :label="DIAGNOSIS_LABEL[diagnoseCategory(hint)]"
                  :title="diagnosisTitle(hint)"
                />
              </div>

              <div class="relative h-1.5 rounded-full bg-muted">
                <div
                  v-if="hint.max_allowed !== null"
                  class="absolute inset-y-0 left-0 rounded-full"
                  :class="DIAGNOSIS_FILL[diagnoseCategory(hint)]"
                  :style="{ width: gaugePercent(hint.max_allowed) + '%' }"
                />
                <div
                  class="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/70"
                  :style="{ left: gaugePercent(hint.threshold) + '%' }"
                  :title="`Threshold: ${hint.threshold}`"
                />
              </div>

              <p class="text-caption-sm text-muted-foreground">
                p50 {{ fmtScore(hint.p50) }} · p95 {{ fmtScore(hint.p95) }} · highest allowed {{ fmtScore(hint.max_allowed) }}
                · {{ hint.samples }} samples · {{ hint.blocked_here }} blocked here
              </p>
            </div>
          </div>

          <div v-if="hints.rows.length" class="space-y-2">
            <p class="text-label-lg text-foreground">Recent flagged or disagreeing prompts</p>
            <div class="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              <div
                v-for="row in hints.rows"
                :key="row.id"
                class="rounded-md border px-3 py-2 space-y-1"
                :class="isDisagreement(row) ? 'border-tone-danger/40 bg-tone-danger/5' : 'border-border'"
              >
                <div class="flex flex-wrap items-center gap-1.5">
                  <AppButton
                    v-if="row.blocked"
                    as="span" variant="tinted" size="xs" tone="caution" label="Blocked before render"
                  />
                  <AppButton
                    v-else-if="row.provider_outcome"
                    as="span" variant="tinted" size="xs"
                    :tone="OUTCOME_TONE[row.provider_outcome]"
                    :label="OUTCOME_LABEL[row.provider_outcome]"
                  />
                  <AppButton v-else as="span" variant="tinted" size="xs" tone="neutral" label="Awaiting render" />
                  <AppButton
                    v-for="category in row.categories_over"
                    :key="category"
                    as="span" variant="tinted" size="xs" tone="danger"
                    :label="formatCategoryLabel(category)"
                  />
                  <span class="text-caption-sm text-muted-foreground ml-auto shrink-0 whitespace-nowrap">
                    {{ formatGenerationType(row.generation_type) }} · {{ row.image_provider }} · {{ formatWhen(row.created_at) }}
                  </span>
                </div>
                <p class="text-caption text-muted-foreground line-clamp-2" :title="row.prompt">{{ row.prompt }}</p>
              </div>
            </div>
            <p v-if="hints.rows.length >= 100" class="text-caption-sm text-muted-foreground italic">
              Showing the most recent 100 rows with kept prompt text.
            </p>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Pricing tab, "Prompt Screening" section. Read-only view of
 * `get_prompt_screening_hints` (prompt screening log, 15 Sep 2026) — the
 * evidence for retuning `IMAGE_PROMPT_THRESHOLDS` in
 * `supabase/functions/_shared/moderation.ts` from real traffic instead of
 * the eight prompts it shipped with.
 *
 * Both the day-window and surface filters are local component state rather
 * than `useUiStore`. The surface filter genuinely fits the Filter State
 * Pattern (it filters the list already on this page) and belongs in the
 * store — it stays local here only because `src/stores/ui.ts` was in flight
 * with another agent's uncommitted work at the time this was written. See
 * this file's PR/session notes for the store addition to merge in once that
 * lands: `promptScreeningSurface` ref + `resetPromptScreeningFilters()`,
 * mirroring `adminAuditFilterAction` / `resetAdminAuditFilters` in ui.ts.
 * The day-window is left local either way — it drives the RPC's own report
 * range rather than filtering an already-fetched list.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { IconShieldCheck, IconWarning } from "@/lib/icons";
import {
  usePromptScreening,
  diagnoseCategory,
  dominantSurface,
  formatCategoryLabel,
  formatGenerationType,
  gaugePercent,
  isBulkGenerationType,
  PROMPT_SCREENING_WINDOWS,
  type CategoryDiagnosis,
  type PromptScreeningCategoryHint,
  type PromptScreeningRow,
  type PromptScreeningWindowDays,
} from "@/composables/admin/usePromptScreening";

const windowDays = ref<PromptScreeningWindowDays>(30);
const selectedType = ref<string | null>(null);
const query = usePromptScreening(windowDays, selectedType);
const hints = computed(() => query.data.value);

const hasActiveFilters = computed(() => selectedType.value !== null);
function resetFilters() {
  selectedType.value = null;
}

/** Every surface seen anywhere in the window, so the picker still shows the
 *  active filter even if this window happens to have zero matches for it. */
const surfaceOptions = computed(() => {
  const types = (hints.value?.by_type ?? []).map((t) => t.generation_type);
  if (selectedType.value && !types.includes(selectedType.value)) types.push(selectedType.value);
  return types;
});

// `by_type` is never narrowed by the surface filter, so it is the source of
// truth for whether the WINDOW is empty, as opposed to the current filter
// merely matching nothing — those need different empty states.
const windowTotal = computed(() => (hints.value?.by_type ?? []).reduce((sum, t) => sum + t.screenings, 0));
const isEmptyWindow = computed(() => windowTotal.value === 0);
// Guarded on selectedType too, not just the total/window mismatch: per the
// RPC's contract an unfiltered `total` always equals `windowTotal`, so this
// combination should only arise with a filter active. Requiring one directly
// avoids ever calling formatGenerationType(null) below.
const isEmptyForFilter = computed(
  () => !isEmptyWindow.value && hints.value?.total === 0 && selectedType.value !== null,
);

const dominance = computed(() => dominantSurface(hints.value?.by_type ?? []));

const stats = computed(() => {
  const h = hints.value;
  if (!h) return [];
  return [
    { label: "Screened", value: h.total, headline: false },
    { label: "Blocked pre-render", value: h.blocked, headline: false },
    // The headline: we allowed it, the image model refused it anyway — every
    // one of these is a threshold sitting too high.
    { label: "Refused after pass", value: h.refused_after_pass, headline: true },
    { label: "Rendered", value: h.rendered, headline: false },
  ];
});

type Tone = "neutral" | "primary" | "danger" | "success" | "info" | "arcane" | "caution";

const DIAGNOSIS_LABEL: Record<CategoryDiagnosis, string> = {
  too_high: "Too high",
  headroom: "Headroom",
  steady: "Steady",
  no_data: "No data",
};
const DIAGNOSIS_TONE: Record<CategoryDiagnosis, Tone> = {
  too_high: "danger",
  headroom: "info",
  steady: "success",
  no_data: "neutral",
};
const DIAGNOSIS_FILL: Record<CategoryDiagnosis, string> = {
  too_high: "bg-tone-danger",
  headroom: "bg-tone-info",
  steady: "bg-tone-success",
  no_data: "bg-muted-foreground/40",
};

function diagnosisTitle(hint: PromptScreeningCategoryHint): string {
  switch (diagnoseCategory(hint)) {
    case "too_high":
      return `${hint.refused_after_pass} prompt(s) we allowed were refused by the renderer anyway — lower this threshold.`;
    case "headroom":
      return `The highest allowed score (${fmtScore(hint.max_allowed)}) sits well below the threshold (${hint.threshold}) — room to raise it.`;
    case "steady":
      return "Traffic sits close to the threshold with no renderer disagreement — no change indicated.";
    case "no_data":
      return "No screenings in this window judged this category.";
  }
}

const OUTCOME_LABEL: Record<"rendered" | "refused" | "error", string> = {
  rendered: "Rendered",
  refused: "Refused by renderer",
  error: "Render errored",
};
const OUTCOME_TONE: Record<"rendered" | "refused" | "error", Tone> = {
  rendered: "success",
  refused: "danger",
  error: "caution",
};

/** The row shape the RPC's own header comment calls "the rows worth reading
 *  first": we allowed it, the renderer refused it anyway. */
function isDisagreement(row: PromptScreeningRow): boolean {
  return !row.blocked && row.provider_outcome === "refused";
}

function fmtScore(value: number | null): string {
  return value === null ? "no data" : value.toFixed(4);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
