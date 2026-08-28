<template>
  <div class="space-y-4">
    <p class="text-caption text-muted-foreground italic">
      Data-subject requests received and answered (#643) — the Art. 12(3) clock runs
      {{ DSR_DEADLINE_DAYS }} days from receipt. Self-serve exports and erasures record
      themselves; use the form below for requests that arrive by email. Entries cannot be
      edited or deleted, and answering a request is one-way.
    </p>

    <!-- Record an email-channel request -->
    <SettingsSection title="Record a request">
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <AppSelect v-model="form.requestType" size="body" aria-label="Request type">
            <option v-for="type in DSR_REQUEST_TYPES" :key="type" :value="type">
              {{ DSR_REQUEST_LABELS[type] }}
            </option>
          </AppSelect>
          <AppInput
            v-model="form.subjectEmail"
            type="email"
            size="body"
            tone="muted"
            :block="false"
            placeholder="Requester's email"
            class="min-w-56 flex-1"
          />
        </div>
        <AppInput
          v-model="form.identityVerification"
          size="body"
          tone="muted"
          placeholder="How was identity verified? e.g. replied from the account address"
        />
        <!-- Deliberately a single-line field rather than RichTextEditor: this is
             an evidence record, and storing operator markup in a compliance log
             makes the note harder to read back than it is to write. -->
        <AppInput
          v-model="form.notes"
          size="body"
          tone="muted"
          placeholder="Notes (optional)"
        />
        <div class="flex items-center gap-3">
          <AppButton
            variant="primary"
            size="sm"
            label="Record request"
            :loading="logRequest.isPending.value"
            :disabled="!canSubmit"
            @click="submit"
          />
          <p v-if="formError" class="text-caption text-destructive">{{ formError }}</p>
        </div>
      </div>
    </SettingsSection>

    <!-- Consent withdrawal — deliberately outside the log above; see the panel. -->
    <WaitlistRemovalPanel />

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <AppInput
        v-model="search"
        type="search"
        size="body"
        tone="muted"
        :block="false"
        placeholder="Search subject, type or notes…"
        class="min-w-56 flex-1"
      />
      <AppSelect v-model="filterStatus" size="body" aria-label="Filter by status">
        <option value="all">All requests</option>
        <option value="open">Open</option>
        <option value="answered">Answered</option>
      </AppSelect>
      <AppButton
        v-if="ui.adminDsrHasActiveFilters"
        variant="subtle"
        size="sm"
        label="Clear"
        @click="ui.resetAdminDsrFilters()"
      />
    </div>

    <div v-if="requestsQuery.isPending.value" class="text-muted-foreground text-body">
      Loading requests…
    </div>
    <div v-else-if="requestsQuery.isError.value" class="text-destructive text-body">
      Failed to load the request log.
    </div>
    <p v-else-if="!requests.length" class="text-muted-foreground text-body italic">
      No data-subject requests have been recorded yet.
    </p>
    <p v-else-if="!filteredRequests.length" class="text-muted-foreground text-body italic">
      No requests match these filters.
    </p>

    <div v-else class="space-y-2">
      <DsrRequestRow
        v-for="request in filteredRequests"
        :key="request.id"
        :request="request"
        :subject-label="subjectLabel(request)"
        :saving="savingId === request.id"
        @fulfil="onFulfil"
      />

      <p
        v-if="requests.length === DSR_REQUEST_LIMIT"
        class="text-caption text-muted-foreground italic pt-1"
      >
        Showing the most recent {{ DSR_REQUEST_LIMIT }} requests.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Requests. The viewer and email-channel entry point for #643.
 *
 * The self-serve rights are NOT written from here — `export_user_data` and
 * `prepare_user_erasure` each write their own entry in the same transaction as
 * the work, so there is no way to produce an export or an erasure without its
 * evidence (the §4d lesson). This tab covers only what cannot log itself.
 */
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import DsrRequestRow from "@/components/admin/DsrRequestRow.vue";
import WaitlistRemovalPanel from "@/components/admin/WaitlistRemovalPanel.vue";
import { useUiStore } from "@/stores/ui";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";
import {
  DSR_DEADLINE_DAYS,
  DSR_REQUEST_LABELS,
  DSR_REQUEST_LIMIT,
  DSR_REQUEST_TYPES,
  useDsrRequests,
  useFulfilDsrRequest,
  useLogDsrRequest,
  type DsrOutcome,
  type DsrRequest,
  type DsrRequestType,
} from "@/composables/admin/useDsrRequests";

const ui = useUiStore();
const { adminDsrSearch: search, adminDsrFilterStatus: filterStatus } = storeToRefs(ui);

const requestsQuery = useDsrRequests();
const usersQuery = useAdminUsers();
const logRequest = useLogDsrRequest();
const fulfilRequest = useFulfilDsrRequest();

const requests = computed(() => requestsQuery.data.value ?? []);

const usersById = computed(() => {
  const map = new Map<string, string>();
  for (const user of usersQuery.data.value ?? []) {
    map.set(user.user_id, user.display_name ?? user.email);
  }
  return map;
});

/**
 * The address is preferred when present because it is what the operator
 * corresponded with. An unresolvable id falls through to the raw uuid — the
 * expected rendering for an erased subject.
 */
function subjectLabel(request: DsrRequest): string {
  if (request.subject_email) return request.subject_email;
  if (request.user_id) return usersById.value.get(request.user_id) ?? request.user_id;
  return "subject erased";
}

const form = reactive({
  requestType: "access" as DsrRequestType,
  subjectEmail: "",
  identityVerification: "",
  notes: "",
});
const formError = ref<string | null>(null);

const canSubmit = computed(
  () => form.subjectEmail.trim() !== "" && form.identityVerification.trim() !== "",
);

async function submit() {
  formError.value = null;
  try {
    await logRequest.mutateAsync({
      requestType: form.requestType,
      identityVerification: form.identityVerification.trim(),
      subjectEmail: form.subjectEmail.trim(),
      notes: form.notes.trim() || null,
    });
    form.subjectEmail = "";
    form.identityVerification = "";
    form.notes = "";
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Which row is mid-save. The mutation's own `isPending` is a single boolean for
 * the whole tab, so binding it to every row put all of them in the loading
 * state when one was answered — ten spinners for one click, and on failure a
 * single error at the top of a page where ten rows looked submitted.
 */
const savingId = ref<string | null>(null);

async function onFulfil(payload: { id: string; outcome: DsrOutcome }) {
  formError.value = null;
  savingId.value = payload.id;
  try {
    await fulfilRequest.mutateAsync(payload);
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    savingId.value = null;
  }
}

const filteredRequests = computed(() => {
  const q = search.value.trim().toLowerCase();
  return requests.value.filter((request) => {
    if (filterStatus.value === "open" && request.outcome) return false;
    if (filterStatus.value === "answered" && !request.outcome) return false;
    if (!q) return true;
    return [
      subjectLabel(request),
      DSR_REQUEST_LABELS[request.request_type] ?? request.request_type,
      request.identity_verification,
      request.notes ?? "",
    ].some((field) => field.toLowerCase().includes(q));
  });
});
</script>
