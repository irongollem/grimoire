<template>
  <div>
    <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
      SEEN AS
    </p>
    <SegmentedControl
      :model-value="modelValue"
      block
      size="sm"
      :options="OPTIONS"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The one alter-ego toggle in the app.
 *
 * It had been written three separate times — the desktop editor header, the
 * sidebar button in `NpcSheet`, and the concept again as prose in the mobile
 * read view's "Disguised as…" line — which is the exact drift `RevealControl`
 * (#750) already exists to end for the reveal-audience half. This is the same
 * fix for the identity half: presentation only, no state, no mutation. The
 * call site decides what "revealed" means and how to persist a change.
 *
 * "True Form" / "Alter Ego" is not new wording invented for this control —
 * it is already this feature's vocabulary, the same two labels the NPC
 * editor's portrait tabs use (`artTab` in `NpcDetail.vue`). Reusing it here
 * means a DM never has to learn a second pair of words for the same idea.
 *
 * No hint line under the control, and no icons on the two options: the labels
 * already say the state, and the only icons that would fit the slot are the
 * reveal control's own eye and eye-off — which mean "players can see this"
 * everywhere else in this popover. Borrowing them for the identity half would
 * say the two halves are the same decision, which is the one thing a DM must
 * not conclude here. Dropping them also buys the labels the width they need to
 * sit on one line.
 */
import { computed } from "vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const { revealed } = defineProps<{ revealed: boolean }>();
const emit = defineEmits<{ change: [boolean] }>();

const OPTIONS = [
  { value: "alter-ego", label: "Alter ego" },
  { value: "true-form", label: "True form" },
] as const;

const modelValue = computed(() => (revealed ? "true-form" : "alter-ego"));

function onUpdate(value: "alter-ego" | "true-form") {
  emit("change", value === "true-form");
}
</script>
