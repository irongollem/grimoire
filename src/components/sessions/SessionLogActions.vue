<template>
  <SessionRecapChip :recap="recap" />
  <AppButton v-if="recap === 'running'" variant="outline" size="xs" label="End" @click="emit('end')" />
  <AppButton v-if="recap === 'none'" variant="primary" size="xs" label="Write notes" @click="emit('write')" />
  <template v-if="session.number === null">
    <form v-if="numbering" class="flex items-center gap-1.5" @submit.prevent="submitNumber">
      <AppInput
        v-model.number="draftNumber"
        type="number"
        size="sm"
        class="w-20"
        placeholder="No."
        aria-label="Session number"
      />
      <AppButton type="submit" variant="primary" size="xs" label="Save" :disabled="draftNumber === null" />
      <AppButton variant="ghost" size="xs" label="Cancel" @click="numbering = false" />
    </form>
    <AppButton v-else variant="ghost" size="xs" label="Number it" @click="numbering = true" />
    <AppButton variant="ghost" size="xs" label="Delete" @click="emit('delete')" />
  </template>
</template>

<script setup lang="ts">
/**
 * The recap chip and the controls that belong to a session in the log: End
 * while it runs, Write notes while there is no recap, Number it / Delete on an
 * unnumbered row. Shared by the row and the card so the two layouts offer the
 * same things; the parent puts them in its own flex wrapper.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SessionRecapChip from "@/components/sessions/SessionRecapChip.vue";
import { sessionRecap } from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

const { session, hasNote } = defineProps<{
  session: CampaignSession;
  hasNote: boolean;
}>();

const emit = defineEmits<{
  write: [];
  end: [];
  delete: [];
  number: [value: number];
}>();

const numbering = ref(false);
const draftNumber = ref<number | null>(null);

const recap = computed(() => sessionRecap(session, hasNote));

function submitNumber() {
  if (draftNumber.value === null) return;
  emit("number", draftNumber.value);
  numbering.value = false;
}
</script>
