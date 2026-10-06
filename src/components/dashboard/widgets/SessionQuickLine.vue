<template>
  <form class="flex items-center gap-2 border-t px-4 py-2.5" @submit.prevent="submit">
    <span class="shrink-0 text-label-lg font-semibold text-muted-foreground">To {{ session.number ?? "this session" }}</span>
    <AppInput
      v-model="line"
      size="sm"
      class="min-w-0 flex-1"
      placeholder="A line for the notes…"
      aria-label="A line for the session notes"
    />
    <AppButton type="submit" variant="outline" size="xs" label="Add" :disabled="line.trim() === '' || busy" />
  </form>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useAppendSessionLine } from "@/composables/sessions/useAppendSessionLine";
import { useToast } from "@/composables/useToast";
import type { CampaignSession } from "@/types/session.types";

/** One line, appended to the running session's note (else the last played one). */
const { session } = defineProps<{ session: CampaignSession }>();

const toast = useToast();
const { append } = useAppendSessionLine();
const line = ref("");
const busy = ref(false);

async function submit() {
  if (line.value.trim() === "" || busy.value) return;
  busy.value = true;
  try {
    await append(session, line.value);
    line.value = "";
  } catch (cause) {
    toast.error(toast.fromError(cause));
  } finally {
    busy.value = false;
  }
}
</script>
