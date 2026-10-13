<template>
  <div class="space-y-4">
    <p v-if="!modelValue" class="text-body text-muted-foreground">
      Only for a class that has no spellcasting of its own, like an Eldritch Knight or an Arcane Trickster.
    </p>
    <AppButton
      v-if="!modelValue"
      variant="subtle"
      size="md"
      label="Add spellcasting"
      @click="emit('update:modelValue', thirdCasterPreset())"
    />

    <template v-else>
      <p v-if="baseClassCasts" class="text-body text-ink-caution">
        {{ baseClass }} already casts, so this is ignored: a class row casts from its class when the class casts.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1.5">ABILITY</label>
          <AppSelect :model-value="modelValue.ability" size="body" weight="normal" block @update:model-value="set({ ability: $event as PreparedAbility })">
            <option v-for="ab in SUBCLASS_ABILITY_OPTIONS" :key="ab.value" :value="ab.value">{{ ab.label }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1.5">SPELL LIST</label>
          <AppSelect :model-value="modelValue.list" size="body" weight="normal" block @update:model-value="set({ list: String($event) })">
            <option v-for="c in SUBCLASS_SPELL_LISTS" :key="c" :value="c">{{ c }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1.5">CASTER TYPE</label>
          <AppSelect :model-value="modelValue.caster_type" size="body" weight="normal" block @update:model-value="set({ caster_type: $event as SubclassSpellcasting['caster_type'] })">
            <option v-for="opt in CASTER_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </AppSelect>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-center border-collapse">
          <thead>
            <tr>
              <th class="text-label text-muted-foreground pb-1.5 pr-2 text-left w-8">LVL</th>
              <th v-for="sl in columns" :key="sl" class="text-label text-muted-foreground pb-1.5 w-10">{{ sl }}</th>
              <th class="text-label text-muted-foreground pb-1.5 w-12 pl-2">KNOWN</th>
              <th class="text-label text-muted-foreground pb-1.5 w-12 pl-2">CANTRIPS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lvl in 20" :key="lvl" class="border-t border-border/40">
              <td class="text-label text-primary pr-2 text-left py-0.5">{{ lvl }}</td>
              <td v-for="sl in columns" :key="sl" class="py-0.5 px-0.5">
                <AppInput
                  :model-value="modelValue.spell_slots[lvl - 1]?.[sl - 1] ?? 0"
                  type="number"
                  tone="muted"
                  size="caption"
                  align="center"
                  min="0"
                  max="9"
                  :block="false"
                  class="w-9"
                  @update:model-value="setSlot(lvl - 1, sl - 1, $event)"
                />
              </td>
              <td class="py-0.5 pl-2">
                <AppInput
                  :model-value="modelValue.spells_known[lvl - 1] ?? 0"
                  type="number"
                  tone="muted"
                  size="caption"
                  align="center"
                  min="0"
                  :block="false"
                  class="w-10"
                  @update:model-value="setKnown('spells_known', lvl - 1, $event)"
                />
              </td>
              <td class="py-0.5 pl-2">
                <AppInput
                  :model-value="modelValue.cantrips_known[lvl - 1] ?? 0"
                  type="number"
                  tone="muted"
                  size="caption"
                  align="center"
                  min="0"
                  :block="false"
                  class="w-10"
                  @update:model-value="setKnown('cantrips_known', lvl - 1, $event)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-caption text-muted-foreground">
        Slots per spell level (columns) at each class level (rows). Spells known only counts for a known caster.
      </p>

      <AppButton variant="destructive" size="md" label="Remove spellcasting" @click="emit('update:modelValue', null)" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * An archetype's own spellcasting (`custom_subclasses.spellcasting`): ability,
 * spell list, caster type and the three level tables, with a third-caster
 * preset so nobody types eighty numbers. Same fields as the class editor's
 * spellcasting section, trimmed to what a subclass carries.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { PreparedAbility, SubclassSpellcasting } from "@/levelup/customTypes";
import {
  SUBCLASS_ABILITY_OPTIONS,
  SUBCLASS_SLOT_COLUMNS,
  SUBCLASS_SPELL_LISTS,
  thirdCasterPreset,
} from "@/levelup/subclassSpellcasting";

const { modelValue, baseClassCasts = false, baseClass = "" } = defineProps<{
  modelValue: SubclassSpellcasting | null;
  /** The base class casts on its own, so the archetype's casting would never be read. */
  baseClassCasts?: boolean;
  baseClass?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: SubclassSpellcasting | null] }>();

const CASTER_TYPE_OPTIONS = [
  { value: "known", label: "Known (Eldritch Knight)" },
  { value: "prepared", label: "Prepared" },
  { value: "spellbook", label: "Spellbook" },
] as const;

const columns = computed(() => {
  const widest = Math.max(SUBCLASS_SLOT_COLUMNS, ...(modelValue?.spell_slots ?? []).map(r => r.length));
  return Array.from({ length: widest }, (_, i) => i + 1);
});

function set(patch: Partial<SubclassSpellcasting>) {
  if (!modelValue) return;
  emit("update:modelValue", { ...modelValue, ...patch });
}

/** A cleared AppInput hands back an empty value; the tables read it as 0, as the class editor does. */
function whole(value: string | number | null): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function setSlot(levelIdx: number, slotIdx: number, value: string | number | null) {
  if (!modelValue) return;
  const grid = modelValue.spell_slots.map(row => [...row]);
  const row = grid[levelIdx] ?? Array<number>(columns.value.length).fill(0);
  while (row.length < columns.value.length) row.push(0);
  row[slotIdx] = whole(value);
  grid[levelIdx] = row;
  set({ spell_slots: grid });
}

function setKnown(key: "spells_known" | "cantrips_known", levelIdx: number, value: string | number | null) {
  if (!modelValue) return;
  const next = [...modelValue[key]];
  next[levelIdx] = whole(value);
  set({ [key]: next });
}
</script>
