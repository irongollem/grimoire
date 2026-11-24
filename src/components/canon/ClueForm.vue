<template>
  <form class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" data-testid="clue-form" @submit.prevent="submit">
    <AppInput v-model="line" tone="filled" size="body" placeholder="The clue, in a line…" aria-label="The clue" />
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Where it can be found</span>
      <WherePicker v-model:kind="kind" for-clue @choose="(t) => (target = t)" />
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <AppButton variant="ghost" size="sm" label="Cancel" @click="emit('cancel')" />
      <AppButton type="submit" variant="outline" size="sm" label="Add clue" :loading="saving" :disabled="!ready" />
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * "New clue for" a secret (frame 05): the clue's line and where it can be found, a place, a person, a quest beat,
 * an item, a handout, or nowhere yet. Emits what to create; the secret's detail owns the write.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import WherePicker, { type Where, type WhereTarget } from "./WherePicker.vue";
import type { ClueKind } from "@/composables/canon/useCanonClues";

const { saving = false } = defineProps<{ saving?: boolean }>();
const emit = defineEmits<{ submit: [clue: { title: string; where: { kind: ClueKind; id: string } | null }]; cancel: [] }>();

const line = ref("");
const kind = ref<Where>("location");
// A place, person or beat chosen is a promise to name one: the add button waits for it.
const target = ref<WhereTarget | null>(null);
watch(kind, () => { target.value = null; });

const ready = computed(() => line.value.trim() !== "" && (kind.value === "nowhere" || target.value !== null));

function submit() {
  if (!ready.value) return;
  emit("submit", { title: line.value.trim(), where: target.value });
}
</script>
