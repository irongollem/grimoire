<template>
  <HearthSection title="The session note">

    <div v-if="note" class="space-y-3 rounded-lg border bg-card p-4">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-heading-xs font-semibold text-foreground">{{ note.title || "Untitled" }}</p>
        <AppButton :to="`/notes/${note.id}`" variant="link" size="inline-xs" label="Open" />
      </div>
      <RichTextViewer :content="note.content" />
    </div>

    <div v-else class="space-y-3 rounded-lg border bg-card p-4">
      <p class="text-body italic text-muted-foreground">{{ heading }} has no notes yet.</p>
      <div class="flex flex-wrap gap-2">
        <AppButton :to="sessionNoteRoute(session.id)" variant="primary" size="sm" label="Write the notes" />
        <AppButton
          :to="sessionNoteRoute(session.id, { chronicler: true })"
          variant="outline"
          size="sm"
          label="Draft with the Chronicler"
        />
      </div>
      <div v-if="candidates.length > 0" class="space-y-1.5 border-t pt-3">
        <label for="link-note" class="text-label-lg font-semibold text-foreground">Link an existing note</label>
        <div class="flex gap-2">
          <AppSelect id="link-note" v-model="chosen" size="md" aria-label="Session note to link" block>
            <option value="">Choose a session note</option>
            <option v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
              {{ candidate.title || "Untitled" }}
            </option>
          </AppSelect>
          <AppButton
            variant="outline"
            size="md"
            label="Link"
            :disabled="chosen === '' || linking.isPending.value"
            @click="link"
          />
        </div>
      </div>
    </div>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { useNotes, useUpdateNote } from "@/composables/notes/useNotes";
import { useToast } from "@/composables/useToast";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { sessionNoteRoute } from "@/lib/sessions/sessionRoutes";
import type { CampaignSession } from "@/types/session.types";

const { session } = defineProps<{ session: CampaignSession }>();

const toast = useToast();
const { data: notes } = useNotes();
const linking = useUpdateNote();
const chosen = ref("");

const heading = computed(() => sessionShortLabel(session).replace("No number", "This session"));
const note = computed(() => (notes.value ?? []).find((n) => n.session_id === session.id) ?? null);
// Session notes nobody has tied to a session yet: the ones a DM wrote before
// the log existed.
const candidates = computed(() =>
  (notes.value ?? []).filter((n) => n.category === "session" && n.session_id === null),
);

async function link() {
  if (chosen.value === "") return;
  try {
    await linking.mutateAsync({ id: chosen.value, update: { session_id: session.id } });
    chosen.value = "";
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}
</script>
