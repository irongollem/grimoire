<template>
  <li class="flex min-w-0 flex-col gap-1.5 border border-border bg-muted/40 px-3 py-2" data-testid="arc-row">
    <span class="flex items-center gap-2">
      <AppInput :key="nameRevision" v-model.lazy="name" size="body" tone="filled" aria-label="The arc's name" maxlength="80" />
      <AppButton :to="`/canon/arcs/${arc.id}`" variant="ghost" size="sm" label="Open" :aria-label="`Open the arc ${arc.name}`" data-testid="arc-open" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" aria-label="Move this arc earlier" :disabled="first" @click="emit('move', -1)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" aria-label="Move this arc later" :disabled="last" @click="emit('move', 1)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconDelete" aria-label="Delete this arc" @click="emit('remove')" />
    </span>
    <AppInput v-model.lazy="summary" wrap size="body" tone="filled" aria-label="What the arc is about" placeholder="What it is about, in a line…" />
    <SegmentedControl :model-value="arc.status" :options="ARC_STATUS_OPTIONS" aria-label="Where the arc stands" @update:model-value="(next) => emit('status', next)" />
    <AppInput v-model.lazy="question" wrap size="body" tone="filled" aria-label="The question it asks" placeholder="The question it asks…" />
    <AppInput v-model.lazy="stakes" wrap size="body" tone="filled" aria-label="What is at stake" placeholder="What is at stake…" />
    <AppInput v-if="arc.status === 'ended'" v-model.lazy="ending" wrap size="body" tone="filled" aria-label="How it ended" placeholder="How it ended…" />
    <label class="flex items-center gap-2">
      <span class="text-eyebrow text-muted-foreground">Theme</span>
      <AppSelect :model-value="arc.theme_id" tone="filled" weight="normal" size="body" aria-label="The theme it carries" @update:model-value="(id) => emit('patch', { theme_id: id })">
        <option :value="null">No theme</option>
        <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.title }}</option>
      </AppSelect>
    </label>
  </li>
</template>

<script setup lang="ts">
/**
 * One arc in the panel: its name, its line, where it stands (planned, running, ended), the question it asks, what is at
 * stake, how it ended (once it has) and the theme it carries; each text saves when its field is left, and emptying an
 * optional one clears it. Order, delete and the arc's own page are here too. A change of status is the parent's to
 * confirm, since leaving Ended throws the ending away.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import type { CanonArc, CanonArcPatch, CanonArcStatus } from "@/composables/canon/useCanonArcs";
import { ARC_STATUS_OPTIONS } from "@/lib/canon/canonArcs";
import { IconChevronDown, IconChevronUp, IconDelete } from "@/lib/icons";

const { arc, themes = [] } = defineProps<{
  arc: CanonArc;
  first: boolean;
  last: boolean;
  /** The premise's theme lines, for the picker. */
  themes?: readonly { id: string; title: string }[];
}>();
const emit = defineEmits<{
  rename: [name: string];
  summarise: [summary: string | null];
  status: [status: CanonArcStatus];
  patch: [patch: CanonArcPatch];
  move: [direction: -1 | 1];
  remove: [];
}>();

const { text: name, revision: nameRevision } = useCommittedText(() => arc.name, (next) => emit("rename", next));

type OptionalText = "summary" | "question" | "stakes" | "ending";
// Each of these is optional, so emptying one clears it (useCommittedText would read a blank as "put the words back").
function optionalText(field: OptionalText) {
  return computed({
    get: () => arc[field] === null ? "" : arc[field],
    set: (typed: string) => {
      const next = typed.trim() === "" ? null : typed.trim();
      if (next === arc[field]) return;
      if (field === "summary") emit("summarise", next);
      else emit("patch", { [field]: next });
    },
  });
}
const summary = optionalText("summary");
const question = optionalText("question");
const stakes = optionalText("stakes");
const ending = optionalText("ending");
</script>
