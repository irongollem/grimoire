<template>
  <WizardStepCard v-if="ask || granted.length > 0" :title="ask ? variantLabel : 'Subclass spells'">
    <template v-if="ask">
      <p class="text-body text-muted-foreground">
        The spells {{ subclass?.subclass_name }} gives you depend on this choice.
      </p>
      <AppSelect
        :model-value="variant"
        size="body"
        weight="normal"
        block
        :aria-label="variantLabel"
        @update:model-value="emit('update:variant', $event)"
      >
        <option value="" disabled>Select {{ variantLabel.toLowerCase() }}…</option>
        <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
      </AppSelect>
    </template>
    <p v-if="granted.length > 0" class="text-body text-foreground" data-testid="subclass-granted-spells">
      You gain {{ grantedNames }}, always prepared.
    </p>
  </WizardStepCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppSelect from "@/components/common/AppSelect.vue";
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import type { CustomSubclass } from "@/levelup/customTypes";
import { subclassGrantedSpellIds, subclassVariantLabel, subclassVariantOptions } from "./subclassSpells";

/**
 * What the subclass does for the character's spells at this level. The server
 * writes the rows; this only says what is coming, and asks for the option
 * (Circle of the Land's terrain) the grants depend on while the character has none.
 */
const props = defineProps<{
  subclass: CustomSubclass | null;
  /** The new level in the class being levelled. */
  classLevel: number;
  /** The option held or picked; "" for none. */
  variant: string;
  /** Whether the character still owes the option, so the select is shown. */
  ask: boolean;
}>();
const emit = defineEmits<{ "update:variant": [value: string] }>();

const { data: spellIndex } = useSpellIndex();
const options = computed(() => subclassVariantOptions(props.subclass));
const variantLabel = computed(() => subclassVariantLabel(props.subclass));
const granted = computed(() => subclassGrantedSpellIds(props.subclass, props.classLevel, props.variant || null));
const grantedNames = computed(() => {
  const names = new Map((spellIndex.value ?? []).map((spell) => [spell.id, spell.name]));
  return granted.value.map((id) => names.get(id) ?? "a spell").join(", ");
});
</script>
