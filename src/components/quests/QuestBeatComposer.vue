<template>
  <form ref="composerForm" class="rounded-lg border border-primary/40 bg-card p-3 shadow-lg" @submit.prevent="submit" @focusout="onFocusOut">
    <h3 class="font-cinzel text-sm font-bold">{{ parallel ? "Add parallel route" : sourceBeatId ? "Add next beat" : "Add beat" }}</h3>
    <div class="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      <AppInput ref="titleInput" v-model="title" placeholder="Beat title…" @keydown.escape.prevent="emit('cancel')" />
      <AppSelect v-model="kind" aria-label="Beat kind">
        <option v-for="option in QUEST_BEAT_KINDS" :key="option" :value="option">{{ QUEST_BEAT_KIND_LABELS[option] }}</option>
      </AppSelect>
    </div>
    <AppInput v-if="parallel" v-model="threadLabel" class="mt-2" placeholder="Thread label — shown to the DM and on the player thread…" aria-label="Opened thread label" />
    <p v-if="error" role="alert" class="mt-2 text-caption text-destructive">{{ error }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <AppButton label="Cancel" size="sm" variant="subtle" @click="emit('cancel')" />
      <AppButton type="submit" :label="parallel ? 'Open thread' : 'Create beat'" size="sm" variant="primary" :disabled="!title.trim() || (parallel && !threadLabel.trim())" :loading="saving" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import AppSelect from "@/components/common/AppSelect.vue";
import { QUEST_BEAT_KINDS, QUEST_BEAT_KIND_LABELS } from "@/types/quest.types";

const { sourceBeatId, parallel = false, saving = false, error = "" } = defineProps<{ sourceBeatId?: string; parallel?: boolean; saving?: boolean; error?: string }>();
const emit = defineEmits<{ cancel: []; submit: [value: { title: string; kind: string; threadLabel?: string }] }>();
const title = ref("");
const kind = ref("neutral");
const threadLabel = ref("");
const titleInput = ref<AppInputHandle | null>(null);
const composerForm = ref<HTMLFormElement | null>(null);

function submit() {
  if (!title.value.trim()) return;
  if (parallel && !threadLabel.value.trim()) return;
  emit("submit", { title: title.value.trim(), kind: kind.value, ...(parallel ? { threadLabel: threadLabel.value.trim() } : {}) });
}
async function onFocusOut() {
  await nextTick();
  if (!title.value.trim() && !composerForm.value?.contains(document.activeElement)) emit("cancel");
}
onMounted(async () => { await nextTick(); titleInput.value?.focus(); });
</script>
