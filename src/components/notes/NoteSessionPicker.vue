<template>
  <div class="flex flex-col gap-2">
    <label class="flex items-center gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Session</span>
      <div class="w-72 max-w-full">
        <EntityCombobox
          v-model="selected"
          :options="options"
          placeholder="Pick a session…"
          dropdown-height="lg"
        >
          <template #option="{ opt }">
            <template v-if="opt.id === NEW_SESSION">
              <span class="text-primary font-semibold">+ A session that is not in the log yet</span>
            </template>
            <template v-else>
              <span class="min-w-0 flex-1 truncate">{{ opt.name }}</span>
              <span class="shrink-0 text-caption text-muted-foreground">
                {{ detailOf(opt.id) }}
              </span>
            </template>
          </template>
        </EntityCombobox>
      </div>
    </label>

    <!-- A session that never went through the app: number, title and day, then it is in the log. -->
    <div
      v-if="adding"
      class="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-2"
    >
      <PastSessionFields v-model="draft" />
      <AppButton
        variant="primary"
        size="md"
        label="Add session"
        :loading="creating"
        :disabled="!isPastSessionComplete(draft)"
        @click="addSession"
      />
      <AppButton variant="subtle" size="md" label="Cancel" @click="adding = false" />
    </div>
    <p v-if="addError" class="text-destructive text-caption">{{ addError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import PastSessionFields, { isPastSessionComplete, pastSessionInput, type PastSessionDraft } from "@/components/sessions/PastSessionFields.vue";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useNotes } from "@/composables/notes/useNotes";
import { useCampaignSessions, useCreatePastSession } from "@/composables/sessions/useCampaignSessions";
import { sessionPickerOptions, type SessionPickerOption } from "@/lib/notes/noteSessions";
import { nextSessionNumber } from "@/lib/sessions/sessionPrefill";

/** Not a session id: the list's last row, which opens the inline form instead of selecting. */
const NEW_SESSION = "__new_session__";

const { ownNoteId = null } = defineProps<{
  /** The note being edited, so its own session does not read as already written up. */
  ownNoteId?: string | null;
}>();

/** The chosen session's id, or null for none. */
const sessionId = defineModel<string | null>({ required: true });

const { data: log } = useCampaignSessions();
const { data: notes } = useNotes();
const { mutateAsync: createSession, isPending: creating } = useCreatePastSession();

const pickerOptions = computed<SessionPickerOption[]>(() =>
  sessionPickerOptions(log.value ?? [], notes.value ?? [], ownNoteId),
);

const options = computed(() => [
  ...pickerOptions.value,
  { id: NEW_SESSION, name: "A session that is not in the log yet" },
]);

const STATE_COPY: Record<SessionPickerOption["state"], string> = {
  "no-note": "no notes yet",
  "has-note": "has a note",
  running: "running",
};

function detailOf(id: string): string {
  const option = pickerOptions.value.find((o) => o.id === id);
  if (!option) return "";
  return [option.day, STATE_COPY[option.state]].filter((p) => p !== "").join(" · ");
}

const adding = ref(false);
const addError = ref("");
const today = useLocalToday();
const draft = ref<PastSessionDraft>({ number: null, title: "", playedOn: today.value });

// The combobox speaks strings; "no session" is the empty string on its side.
const selected = computed<string>({
  get: () => sessionId.value ?? "",
  set: (id) => {
    if (id === NEW_SESSION) {
      draft.value = { number: nextSessionNumber(log.value ?? []), title: "", playedOn: today.value };
      addError.value = "";
      adding.value = true;
      return;
    }
    sessionId.value = id === "" ? null : id;
  },
});

async function addSession() {
  addError.value = "";
  const input = pastSessionInput(draft.value);
  if (input === null) return;
  try {
    const created = await createSession(input);
    sessionId.value = created.id;
    adding.value = false;
  } catch (e: unknown) {
    addError.value = e instanceof Error ? e.message : "Could not add the session";
  }
}
</script>
