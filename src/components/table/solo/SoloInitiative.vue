<template>
  <!-- A fight from the AI table opens on this: initiative is the one thing the fight cannot start without, so it is
       asked for at once. Roll here, or roll real dice and type the face. It cannot be dismissed: there is nothing
       to do on the fight screen before it. -->
  <AppModal :open="open" size="sm" :dismissable="false">
    <ModalHeader title="Roll for initiative" :subtitle="`${name} · ${formula}`" />
    <div class="flex flex-col gap-3 px-5 py-4" data-testid="solo-initiative">
      <p v-if="disadvantage" class="text-caption text-muted-foreground">Disadvantage from a condition: two dice, the lower counts.</p>
      <AppButton variant="primary" size="md" block label="Roll it here" :disabled="busy" @click="rollHere" />
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-caption text-muted-foreground">
          <span>{{ disadvantage ? "The lower die I rolled was a" : "I rolled a" }}</span>
          <AppInput v-model.number="typed" type="number" size="md" class="w-16" aria-label="The face you rolled" :disabled="busy" @keydown.enter.prevent="useTyped" />
        </label>
        <AppButton variant="outline" size="md" label="Use my roll" :disabled="busy || !typedOk" @click="useTyped" />
      </div>
      <p class="text-caption text-muted-foreground">Everyone else rolls by themselves, and the fight starts.</p>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { rollInitiativeValue } from "@/rules/encounterCombatLogic";
import { isFace } from "@/lib/table/tableRoll";

const { open, name, modifier, disadvantage = false, busy = false } = defineProps<{
  open: boolean;
  /** Whose initiative it is. */
  name: string;
  /** What the character adds to the d20. */
  modifier: number;
  /** A condition imposes disadvantage on the roll. */
  disadvantage?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ rolled: [total: number] }>();

const typed = ref<number | null>(null);
const typedOk = computed(() => isFace(typed.value));
const formula = computed(() => (modifier === 0 ? "d20" : modifier > 0 ? `d20 + ${modifier}` : `d20 - ${-modifier}`));

function rollHere(): void {
  if (busy) return;
  emit("rolled", rollInitiativeValue({ modifier, disadvantage }));
}

function useTyped(): void {
  if (busy || !isFace(typed.value)) return;
  emit("rolled", typed.value + modifier);
}
</script>
