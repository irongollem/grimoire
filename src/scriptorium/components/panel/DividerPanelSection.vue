<template>
  <div data-testid="panel-divider">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Divider</h2>
      <PanelField label="Style">
        <SegmentedControl :model-value="current" :options="OPTIONS" size="xs" block @update:model-value="pick" />
      </PanelField>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/** A divider selected: a rule under a chapter title. It has one choice, its style. */
import { computed } from "vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import { dividerVariant, type DividerVariant } from "@/scriptorium/tiptap/divider";

const props = defineProps<{ variant: unknown }>();
const emit = defineEmits<{ update: [patch: { variant: DividerVariant }] }>();

const OPTIONS: SegmentedOption<DividerVariant>[] = [
  { value: "flourish", label: "Flourish" },
  { value: "rule", label: "Rule" },
  { value: "stars", label: "Stars" },
];

const current = computed(() => dividerVariant(props.variant));

function pick(value: DividerVariant) {
  emit("update", { variant: dividerVariant(value) });
}
</script>
