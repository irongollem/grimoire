<template>
  <AppModal open size="sm" @close="emit('cancel')">
    <!-- A dialog, like every other "new" on the app: it opened inline above the
         flow until 14 Nov 2026, a pattern used nowhere else. -->
    <ModalHeader :title="heading" closeable @close="emit('cancel')" />
    <form class="flex flex-col gap-3 px-5 py-4" @submit.prevent="submit">
      <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
        <AppInput ref="titleInput" v-model="title" placeholder="Beat title…" aria-label="Beat title" />
        <AppSelect v-model="kind" aria-label="Beat kind">
          <option v-for="option in QUEST_BEAT_KINDS" :key="option" :value="option">{{ QUEST_BEAT_KIND_LABELS[option] }}</option>
        </AppSelect>
      </div>
      <AppInput v-if="parallel" v-model="threadLabel" placeholder="What the party does: it also names the thread it opens…" aria-label="Opened thread label" />
      <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <AppButton label="Cancel" size="sm" variant="subtle" @click="emit('cancel')" />
        <AppButton type="submit" :label="parallel ? 'Open thread' : 'Create beat'" size="sm" variant="primary" :disabled="!title.trim() || (parallel && !threadLabel.trim())" :loading="saving" />
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { QUEST_BEAT_KINDS, QUEST_BEAT_KIND_LABELS } from "@/types/quest.types";

const { sourceBeatId, parallel = false, saving = false, error = "" } = defineProps<{ sourceBeatId?: string; parallel?: boolean; saving?: boolean; error?: string }>();
const emit = defineEmits<{ cancel: []; submit: [value: { title: string; kind: string; threadLabel?: string }] }>();
const title = ref("");
const kind = ref("neutral");
const threadLabel = ref("");
const heading = computed(() => (parallel ? "Add parallel route" : sourceBeatId ? "Add the next beat" : "Add beat"));
const titleInput = ref<AppInputHandle | null>(null);

function submit() {
  if (!title.value.trim()) return;
  if (parallel && !threadLabel.value.trim()) return;
  emit("submit", { title: title.value.trim(), kind: kind.value, ...(parallel ? { threadLabel: threadLabel.value.trim() } : {}) });
}
onMounted(async () => { await nextTick(); titleInput.value?.focus(); });
</script>
