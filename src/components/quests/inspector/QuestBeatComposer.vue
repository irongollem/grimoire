<template>
  <AppModal open size="sm" @close="emit('cancel')">
    <!-- A dialog, like every other "new" on the app: it opened inline above the
         flow until 14 Nov 2026, a pattern used nowhere else. One dialog for a
         beat and its route; the route's kind is picked here, not by a second
         button. -->
    <ModalHeader :title="heading" closeable @close="emit('cancel')" />
    <form class="flex flex-col gap-3 px-5 py-4" @submit.prevent="submit">
      <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
        <AppInput ref="titleInput" v-model="title" placeholder="Beat title…" aria-label="Beat title" />
        <AppSelect v-model="kind" aria-label="Beat kind">
          <option v-for="option in QUEST_BEAT_KINDS" :key="option" :value="option">{{ QUEST_BEAT_KIND_LABELS[option] }}</option>
        </AppSelect>
      </div>
      <template v-if="sourceBeatId">
        <div class="flex flex-col gap-1">
          <span class="text-caption font-semibold text-foreground">The route there</span>
          <SegmentedControl v-model="routeKind" size="sm" :options="routeKindOptions" aria-label="Route kind" />
        </div>
        <AppInput
          v-model="routeLabel"
          :placeholder="routeKind === 'parallel' ? 'What the party does; it also names the thread it opens' : 'What the party does (optional)'"
          aria-label="What the party does"
        />
      </template>
      <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <AppButton label="Cancel" size="sm" variant="subtle" @click="emit('cancel')" />
        <AppButton type="submit" :label="routeKind === 'parallel' ? 'Open thread' : 'Create beat'" size="sm" variant="primary" :disabled="!canSubmit" :loading="saving" />
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
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { QUEST_BEAT_KINDS, QUEST_BEAT_KIND_LABELS, type QuestRouteKind } from "@/types/quest.types";

export interface ComposedBeat {
  title: string;
  kind: string;
  /** The route from the source beat; absent when there is no source. */
  route?: { kind: QuestRouteKind; label: string | null };
}

const { sourceBeatId, canBeParallel = false, saving = false, error = "" } = defineProps<{
  sourceBeatId?: string;
  /** The source beat already has a choice route: "and also" may never be its only way out. */
  canBeParallel?: boolean;
  saving?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ cancel: []; submit: [value: ComposedBeat] }>();
const title = ref("");
const kind = ref("neutral");
const routeKind = ref<QuestRouteKind>("choice");
const routeLabel = ref("");
const heading = computed(() => (sourceBeatId ? "Add the next beat" : "Add beat"));
const titleInput = ref<AppInputHandle | null>(null);

const routeKindOptions = computed<SegmentedOption<QuestRouteKind>[]>(() => [
  { value: "choice", label: "They choose one" },
  {
    value: "parallel",
    label: "And also",
    disabled: !canBeParallel,
    tooltip: canBeParallel ? undefined : "Needs another route out of this beat first",
  },
]);
const canSubmit = computed(() => !!title.value.trim() && (routeKind.value !== "parallel" || !!routeLabel.value.trim()));

function submit() {
  if (!canSubmit.value) return;
  const label = routeLabel.value.trim();
  emit("submit", {
    title: title.value.trim(),
    kind: kind.value,
    ...(sourceBeatId ? { route: { kind: routeKind.value, label: label === "" ? null : label } } : {}),
  });
}
onMounted(async () => { await nextTick(); titleInput.value?.focus(); });
</script>
