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
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import {
  DSR_OUTCOME_LABELS,
  DSR_OUTCOMES,
  DSR_REQUEST_LABELS,
  daysUntilDue,
  type DsrOutcome,
  type DsrRequest,
} from "@/composables/useDsrRequests";

const { request, subjectLabel, saving = false } = defineProps<{
  request: DsrRequest;
  /** Resolved by the parent against the admin user list; falls back to the raw id. */
  subjectLabel: string;
  saving?: boolean;
}>();

const emit = defineEmits<{ fulfil: [payload: { id: string; outcome: DsrOutcome }] }>();

const outcome = ref<DsrOutcome>("fulfilled");

const days = daysUntilDue(request, new Date());
const dueLabel =
  days < 0 ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
  : days === 0 ? "Due today"
  : `Due in ${days} day${days === 1 ? "" : "s"}`;
const dueClass = days < 0 ? "text-destructive font-semibold" : days <= 7 ? "text-caution" : "text-muted-foreground";

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
