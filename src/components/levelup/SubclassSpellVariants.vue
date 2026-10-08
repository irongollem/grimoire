<template>
  <div class="space-y-4">
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5" for="spell-variant-label">WHAT THE PLAYER CHOOSES</label>
      <AppInput
        id="spell-variant-label"
        :model-value="label ?? ''"
        :model-modifiers="{ lazy: true }"
        size="body"
        placeholder="e.g. Terrain"
        @update:model-value="onLabel"
      />
    </div>

    <div v-for="(name, i) in optionNames" :key="`${i}-${rev}`" class="rounded-md border border-border bg-muted/10 p-3 space-y-3">
      <div class="flex items-center gap-2">
        <AppInput
          :model-value="name"
          :model-modifiers="{ lazy: true }"
          size="body"
          aria-label="Option name"
          @update:model-value="(v: string) => renameOption(name, v)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-sm"
          :icon="IconDelete"
          :aria-label="`Remove ${name}`"
          @click="removeOption(name)"
        />
      </div>
      <SpellsByLevelGrid
        :model-value="variants[name] ?? {}"
        :all-spell-options="allSpellOptions"
        level-kind="class"
        @update:model-value="(v) => setOption(name, v)"
      />
      <div class="space-y-2 border-t border-border pt-3">
        <span class="block text-eyebrow text-muted-foreground">ADDED TO THE CLASS'S SPELL LIST (BY SPELL LEVEL)</span>
        <SpellsByLevelGrid
          :model-value="expandedVariants[name] ?? {}"
          :all-spell-options="allSpellOptions"
          level-kind="spell"
          @update:model-value="(v) => setExpanded(name, v)"
        />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <AppInput
        v-model="newOption"
        size="body"
        placeholder="New option, e.g. Arctic"
        aria-label="New option name"
        @keydown.enter.prevent="addOption"
      />
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add option"
        :disabled="!canAdd"
        @click="addOption"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `spell_variants` and `spell_variant_label`: spells granted by a choice the
 * character makes (Circle of the Land terrain). The author names the choice,
 * adds options, and gives each option a class-level spell grid exactly like
 * `granted_spells`. Option names are the record keys, so a rename rebuilds the
 * record in place to keep the order.
 */
import { ref, computed } from "vue";
import { IconAdd, IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import SpellsByLevelGrid from "./SpellsByLevelGrid.vue";

defineProps<{ allSpellOptions: { id: string; name: string }[] }>();

const variants = defineModel<Record<string, Record<string, string[]>>>("variants", { required: true });
const expandedVariants = defineModel<Record<string, Record<string, string[]>>>("expandedVariants", { required: true });
const label = defineModel<string | null>("label", { required: true });

// One shared option list: an option may exist in either map or both.
const optionNames = computed(() => [...new Set([...Object.keys(variants.value), ...Object.keys(expandedVariants.value)])]);
const newOption = ref("");
// Bumped when a rename is refused, so the field remounts and shows the real name again.
const rev = ref(0);

const canAdd = computed(() => {
  const n = newOption.value.trim();
  return n !== "" && !optionNames.value.includes(n);
});

function onLabel(value: string) {
  label.value = value.trim() === "" ? null : value.trim();
}

function addOption() {
  if (!canAdd.value) return;
  variants.value = { ...variants.value, [newOption.value.trim()]: {} };
  newOption.value = "";
}

function without(map: Record<string, Record<string, string[]>>, name: string) {
  const copy = { ...map };
  delete copy[name];
  return copy;
}

function removeOption(name: string) {
  variants.value = without(variants.value, name);
  expandedVariants.value = without(expandedVariants.value, name);
}

function setOption(name: string, value: Record<string, string[]>) {
  variants.value = { ...variants.value, [name]: value };
}

function setExpanded(name: string, value: Record<string, string[]>) {
  expandedVariants.value = { ...expandedVariants.value, [name]: value };
}

function rekey(map: Record<string, Record<string, string[]>>, from: string, to: string) {
  if (!(from in map)) return map;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [k, v] of Object.entries(map)) out[k === from ? to : k] = v;
  return out;
}

function renameOption(oldName: string, raw: string) {
  const next = raw.trim();
  if (next === oldName) return;
  if (next === "" || optionNames.value.includes(next)) {
    rev.value++;
    return;
  }
  variants.value = rekey(variants.value, oldName, next);
  expandedVariants.value = rekey(expandedVariants.value, oldName, next);
}
</script>
