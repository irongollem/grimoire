<template>
  <div class="flex flex-col gap-2" data-testid="connection-notes-editor">
    <div>
      <label class="field-label" :for="noteId">Note <span class="font-normal normal-case italic text-muted-foreground">yours, never shown to players</span></label>
      <AppInput :id="noteId" v-model="draft.note" tone="card" size="body" block placeholder="Why they are tied" />
    </div>
    <div>
      <label class="field-label" :for="toldId">Told <span class="font-normal normal-case italic text-muted-foreground">what someone who knows reads</span></label>
      <AppInput :id="toldId" v-model="draft.told" tone="card" size="body" block placeholder="What the party would say" />
    </div>
    <div class="flex items-center justify-between gap-2">
      <AutosaveStatus :status="status" :error="saveError" />
      <AppButton variant="subtle" size="sm" label="Done" @click="done" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A link's two lines, edited where they are read (#1084): the DM's own note and
 * the line a player who knows of the tie reads. It saves itself, so there is no
 * Save and the action bar's Cancel is a Done that only closes the editor.
 */
import { reactive, useId } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useUpdateLink } from "@/composables/connections/useConnections";
import { useAutosave } from "@/composables/useAutosave";
import type { Connection } from "@/types/connections.types";

const { connection } = defineProps<{ connection: Connection }>();
const emit = defineEmits<{ done: [] }>();

interface Lines {
  note: string;
  told: string;
}

/** A link always carries both lines (the table defaults them to empty); only a record's row has null. */
function linesOf(c: Connection): Lines {
  if (c.note === null || c.told === null) throw new Error("only a link has a note and a told line");
  return { note: c.note, told: c.told };
}

const noteId = useId();
const toldId = useId();
const update = useUpdateLink();
const draft = reactive<Lines>(linesOf(connection));

const { status, saveError, saveNow } = useAutosave<Lines>({
  draft,
  initial: () => linesOf(connection),
  equal: (a, b) => a.note === b.note && a.told === b.told,
  save: (snapshot) => update.mutateAsync({ id: connection.row_id, note: snapshot.note, told: snapshot.told }),
  errorMessage: "Could not save that connection",
});

async function done() {
  await saveNow();
  emit("done");
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply mb-1 block text-label-lg font-semibold text-muted-foreground;
}
</style>
