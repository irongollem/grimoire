<template>
  <form ref="composerForm" class="rounded-lg border border-primary/40 bg-card p-3 shadow-lg" @submit.prevent="submit" @focusout="onFocusOut">
    <h3 class="font-cinzel text-sm font-bold">{{ sourceBeatId ? "Add next beat" : "Add beat" }}</h3>
    <div class="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      <AppInput ref="titleInput" v-model="title" placeholder="Beat title…" @keydown.escape.prevent="emit('cancel')" />
      <AppSelect v-model="kind" aria-label="Beat kind">
        <option v-for="option in kinds" :key="option" :value="option">{{ option }}</option>
      </AppSelect>
    </div>
    <AppInput v-if="sourceBeatId" v-model="edgeLabel" class="mt-2" placeholder="Route condition (DM-only, optional)…" @keydown.escape.prevent="emit('cancel')" />
    <p v-if="error" role="alert" class="mt-2 text-caption text-destructive">{{ error }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <AppButton label="Cancel" size="sm" variant="subtle" @click="emit('cancel')" />
      <AppButton type="submit" label="Create beat" size="sm" variant="primary" :disabled="!title.trim()" :loading="saving" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const { sourceBeatId, saving = false, error = "" } = defineProps<{ sourceBeatId?: string; saving?: boolean; error?: string }>();
const emit = defineEmits<{ cancel: []; submit: [value: { title: string; kind: string; edgeLabel: string }] }>();
const title = ref("");
const kind = ref("neutral");
const edgeLabel = ref("");
const titleInput = ref<InstanceType<typeof AppInput> | null>(null);
const composerForm = ref<HTMLFormElement | null>(null);
const kinds = ["neutral", "combat", "social", "explore", "discovery"];

function submit() {
  if (title.value.trim()) emit("submit", { title: title.value.trim(), kind: kind.value, edgeLabel: edgeLabel.value.trim() });
}
async function onFocusOut() {
  await nextTick();
  if (!title.value.trim() && !composerForm.value?.contains(document.activeElement)) emit("cancel");
}
onMounted(async () => { await nextTick(); titleInput.value?.focus(); });
</script>
