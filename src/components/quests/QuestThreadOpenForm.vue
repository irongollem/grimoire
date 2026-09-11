<template>
  <div
    class="flex flex-col gap-2 rounded-lg border p-3"
    :class="layout === 'row' ? 'w-full border-border bg-background sm:flex-row sm:items-end' : 'border-dashed border-border'"
  >
    <div class="min-w-0" :class="layout === 'row' ? 'flex-1' : ''">
      <p class="mb-1 text-caption text-muted-foreground">Beat</p>
      <EntityCombobox v-model="beatId" :options="options" placeholder="Choose a beat…" />
    </div>
    <div class="min-w-0" :class="layout === 'row' ? 'flex-1' : ''">
      <p class="mb-1 text-caption text-muted-foreground">Label</p>
      <AppInput v-model="label" placeholder="What is this thread?" :class="layout === 'stack' ? 'min-h-11' : ''" />
    </div>
    <div class="min-w-0" :class="layout === 'row' ? 'flex-1' : ''">
      <p class="mb-1 text-caption text-muted-foreground">Reason</p>
      <AppInput v-model="reason" placeholder="Why open it now? (optional)" :class="layout === 'stack' ? 'min-h-11' : ''" />
    </div>
    <div class="flex gap-2">
      <AppButton label="Cancel" size="sm" variant="subtle" :class="layout === 'stack' ? 'min-h-11 flex-1' : ''" @click="emit('cancel')" />
      <AppButton
        label="Open thread"
        size="sm"
        variant="primary"
        :class="layout === 'stack' ? 'min-h-11 flex-1' : ''"
        :loading="pending"
        :disabled="!beatId || !label.trim()"
        @click="emit('submit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The "open a thread" form (Beat combobox, Label, Reason, Cancel/Open thread)
 * shared by `QuestThreadBar`'s inline `sm+` row and its mobile sheet (#872,
 * review fix 1) — before this it was the same five fields written out twice,
 * one arrangement apart. `layout` picks the two arrangements the frame
 * draws: `"row"` lays the fields out side by side with a solid border
 * (desktop), `"stack"` stacks them full-width with 44px inputs and a dashed
 * border (the sheet). The caller still owns `formOpen`/visibility (a
 * `v-show` + `drawerTransition()` wrapping this component, same as before)
 * and the actual mutation — this component only names the fields and the
 * two actions.
 */
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { options, pending = false, layout = "row" } = defineProps<{
  options: Array<{ id: string; name: string }>;
  pending?: boolean;
  layout?: "row" | "stack";
}>();
const beatId = defineModel<string>("beatId", { required: true });
const label = defineModel<string>("label", { required: true });
const reason = defineModel<string>("reason", { required: true });
const emit = defineEmits<{ submit: []; cancel: [] }>();
</script>
