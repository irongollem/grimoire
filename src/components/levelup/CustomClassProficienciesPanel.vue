<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Proficiencies</h2>

    <!-- Saving throws -->
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-2">SAVING THROWS</label>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="st in SAVE_KEYS"
          :key="st.key"
          class="flex items-center gap-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            :value="st.key"
            :checked="savingThrows.includes(st.key)"
            class="accent-primary"
            @change="toggleSave(st.key)"
          />
          <span class="font-cinzel text-xs text-foreground">{{ st.label }}</span>
        </label>
      </div>
    </div>

    <!-- Armor -->
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5">ARMOR PROFICIENCIES</label>
      <TagInput :model-value="armorProficiencies" placeholder="e.g. Light armor, Shields…" @update:model-value="emit('update:armorProficiencies', $event)" />
    </div>

    <!-- Weapons -->
    <div>
      <label class="block text-eyebrow text-muted-foreground mb-1.5">WEAPON PROFICIENCIES</label>
      <TagInput :model-value="weaponProficiencies" placeholder="e.g. Simple weapons, Firearms…" @update:model-value="emit('update:weaponProficiencies', $event)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import TagInput from "@/components/common/TagInput.vue";

const SAVE_KEYS = [
  { key: "Strength",     label: "STR" },
  { key: "Dexterity",   label: "DEX" },
  { key: "Constitution", label: "CON" },
  { key: "Intelligence", label: "INT" },
  { key: "Wisdom",       label: "WIS" },
  { key: "Charisma",     label: "CHA" },
] as const;

const { savingThrows, armorProficiencies, weaponProficiencies } = defineProps<{
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
}>();

const emit = defineEmits<{
  "update:savingThrows": [value: string[]];
  "update:armorProficiencies": [value: string[]];
  "update:weaponProficiencies": [value: string[]];
}>();

function toggleSave(key: string) {
  const next = savingThrows.includes(key)
    ? savingThrows.filter(k => k !== key)
    : [...savingThrows, key];
  emit("update:savingThrows", next);
}
</script>
