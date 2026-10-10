<template>
  <li class="relative grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[9.5rem_minmax(0,1fr)_auto] md:items-center">
    <div class="flex flex-wrap items-baseline gap-x-2 md:block">
      <p v-if="session.number !== null" class="log-rubric">Session {{ session.number }}</p>
      <p v-else class="text-label-lg italic text-muted-foreground">No number</p>
      <p class="text-caption text-muted-foreground">{{ dateLine }}</p>
    </div>

    <div class="min-w-0">
      <RouterLink
        :to="`/sessions/${session.id}`"
        class="block truncate text-heading-xs font-semibold text-foreground after:absolute after:inset-0 hover:text-primary"
      >
        {{ session.title?.trim() || fallbackTitle }}
      </RouterLink>
      <p v-if="meta" class="text-caption text-muted-foreground">{{ meta }}</p>
    </div>

    <div class="relative z-10 flex flex-wrap items-center gap-2 md:justify-end">
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
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SessionRecapChip from "@/components/sessions/SessionRecapChip.vue";
import {
  sessionMeta,
  sessionRecap,
  sessionShortDate,
  type SessionFacts,
} from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

const { session, facts, hasNote } = defineProps<{
  session: CampaignSession;
  facts: SessionFacts;
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
const dateLine = computed(() => sessionShortDate(session));
const meta = computed(() => sessionMeta(session, facts));
// A session with no title still needs something to click: its day is the name
// it would be called at the table.
const fallbackTitle = computed(() => (session.number === null ? "Untitled session" : `Session ${session.number}`));

function submitNumber() {
  if (draftNumber.value === null) return;
  emit("number", draftNumber.value);
  numbering.value = false;
}
</script>

<style scoped>
/* Cinzel by name, as the Hearth rubric does: Vellum repaints font-cinzel as
   Alegreya, and a rubric is display type. */
.log-rubric {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--live-ink, var(--primary));
}
</style>
