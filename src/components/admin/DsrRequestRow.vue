<template>
  <div class="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        as="span"
        variant="tinted"
        size="xs"
        :tone="request.request_type === 'erasure' ? 'danger' : 'info'"
        :label="DSR_REQUEST_LABELS[request.request_type] ?? request.request_type"
      />
      <AppButton
        as="span"
        variant="tinted"
        size="xs"
        emphasis="outline"
        :tone="request.channel === 'self_serve' ? 'success' : 'caution'"
        :label="request.channel === 'self_serve' ? 'Self-serve' : 'By email'"
      />
      <span class="text-body text-foreground truncate">{{ subjectLabel }}</span>
      <span class="text-caption text-muted-foreground ml-auto shrink-0">
        {{ formatWhen(request.received_at) }}
      </span>
    </div>

    <p class="text-caption text-muted-foreground">
      Identity: {{ request.identity_verification }}
      <template v-if="request.notes">
        <span class="mx-1 opacity-40">·</span>{{ request.notes }}
      </template>
    </p>

    <div class="flex flex-wrap items-center gap-2 pt-0.5">
      <span v-if="request.outcome" class="text-caption text-muted-foreground">
        {{ DSR_OUTCOME_LABELS[request.outcome] ?? request.outcome }}
        on {{ formatWhen(request.fulfilled_at!) }}
      </span>
      <span v-else class="text-caption" :class="dueClass">{{ dueLabel }}</span>

      <span v-if="request.anonymized_at" class="text-caption text-muted-foreground italic">
        <span class="mx-1 opacity-40">·</span>subject erased
      </span>

      <!-- Answering is one-way (the guard refuses a second answer), so the
           control disappears once the request is closed rather than staying
           visible and failing. -->
      <div v-if="!request.outcome && !request.anonymized_at" class="flex items-center gap-2 ml-auto">
        <AppSelect v-model="outcome" size="body" aria-label="Outcome">
          <option v-for="value in DSR_OUTCOMES" :key="value" :value="value">
            {{ DSR_OUTCOME_LABELS[value] }}
          </option>
        </AppSelect>
        <AppButton
          variant="outline"
          size="sm"
          label="Mark answered"
          :loading="saving"
          @click="emit('fulfil', { id: request.id, outcome })"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One row of Admin → Requests (#643).
 *
 * `user_id` is not a foreign key, so an id here often resolves to nobody —
 * that is the expected rendering once the subject is erased, not a bug. The row
 * has to outlive the person for it to evidence that their request was answered,
 * which is the whole reason this table does not cascade.
 */
import { computed, onUnmounted, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import {
  DSR_OUTCOME_LABELS,
  DSR_OUTCOMES,
  DSR_REQUEST_LABELS,
  daysUntilDue,
  type DsrOutcome,
  type DsrRequest,
} from "@/composables/admin/useDsrRequests";

const { request, subjectLabel, saving = false } = defineProps<{
  request: DsrRequest;
  /** Resolved by the parent against the admin user list; falls back to the raw id. */
  subjectLabel: string;
  saving?: boolean;
}>();

const emit = defineEmits<{ fulfil: [payload: { id: string; outcome: DsrOutcome }] }>();

const outcome = ref<DsrOutcome>("fulfilled");

/**
 * Recomputed rather than captured at setup. Rows are keyed by `request.id`, so
 * Vue reuses the instance across refetches — a plain const would freeze both
 * the row's data and the `new Date()` it was measured against, and a request
 * that went overdue while the tab sat open would keep rendering "Due in 1 day"
 * in muted grey. The overdue state is the whole reason this tab exists.
 *
 * `now` ticks on a timer so the countdown crosses midnight on its own; an admin
 * leaving this open overnight is the normal case, not an edge one.
 */
const now = ref(new Date());
const timer = setInterval(() => { now.value = new Date(); }, 60_000);
onUnmounted(() => clearInterval(timer));

const days = computed(() => daysUntilDue(request, now.value));

const dueLabel = computed(() => {
  const d = days.value;
  if (d < 0) return `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`;
  if (d === 0) return "Due today";
  return `Due in ${d} day${d === 1 ? "" : "s"}`;
});

// `text-tone-caution`, not `text-caution`: theme.css defines `--color-tone-caution`,
// and Tailwind v4 generates utilities from the token name. An unknown utility is
// silently dropped rather than failing the build, so `text-caution` rendered as
// plain foreground — a warning state indistinguishable from a request due in two
// months, invisible to lint, typecheck and tests alike.
const dueClass = computed(() =>
  days.value < 0 ? "text-destructive font-semibold"
  : days.value <= 7 ? "text-tone-caution"
  : "text-muted-foreground",
);

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
