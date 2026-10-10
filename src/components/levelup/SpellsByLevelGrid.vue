<template>
  <div class="space-y-3">
    <div v-if="populatedLevels.length > 0" class="space-y-3">
      <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
        <span class="text-label-lg text-primary w-8 pt-2 shrink-0" :title="`${levelNoun} ${lvl}`">{{ lvl }}</span>
        <div class="flex-1 min-w-0 space-y-2">
          <div v-if="(model[lvl.toString()] ?? []).length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="sid in model[lvl.toString()]"
              :key="sid"
              class="inline-flex items-center gap-1 rounded-full bg-tone-success/10 border border-tone-success/20 px-2.5 py-0.5 text-caption text-ink-success"
            >
              {{ spellNameById(sid) }}
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                class="ml-0.5"
                label="×"
                :aria-label="`Remove ${spellNameById(sid)}`"
                @click="removeSpellFromLevel(lvl, sid)"
              />
            </span>
          </div>
          <EntityCombobox
            model-value=""
            :options="availableSpellsForLevel(lvl)"
            placeholder="Add spell…"
            @update:model-value="(sid) => sid && addSpellToLevel(lvl, sid)"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <AppSelect v-model="addLevelValue" weight="normal" :aria-label="`${levelNoun} to add`">
        <option value="" disabled>{{ levelNoun }}…</option>
        <option v-for="n in maxLevel" :key="n" :value="n">{{ n }}</option>
      </AppSelect>
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        :label="`Add ${levelNoun.toLowerCase()}`"
        :disabled="!addLevelValue || populatedLevels.includes(Number(addLevelValue))"
        @click="addLevel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Spell ids grouped by a level, as `{ "<level>": [spell ids] }`. One editor for
 * every per-level spell map on a subclass: `granted_spells` and each variant
 * option are keyed by CLASS level (1-20), `expanded_spells` by SPELL level (1-9).
 * Bare on purpose, no card or heading: the caller supplies the surrounding
 * section, so it nests inside a variant option as readily as it stands alone.
 */
import { ref, computed } from "vue";
import { IconAdd } from "@/lib/icons";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";

const { allSpellOptions, levelKind = "class" } = defineProps<{
  allSpellOptions: { id: string; name: string }[];
  /** What the key means: a class level (1-20) or a spell level (1-9). */
  levelKind?: "class" | "spell";
}>();

const model = defineModel<Record<string, string[]>>({ required: true });

const maxLevel = computed(() => (levelKind === "spell" ? 9 : 20));
const levelNoun = computed(() => (levelKind === "spell" ? "Spell level" : "Class level"));

const populatedLevels = computed<number[]>(() =>
  Object.keys(model.value).map(Number).sort((a, b) => a - b),
);

const addLevelValue = ref<number | "">("");

function spellNameById(spellId: string): string {
  return allSpellOptions.find(s => s.id === spellId)?.name ?? spellId;
}

function availableSpellsForLevel(level: number) {
  const selected = new Set(model.value[level.toString()] ?? []);
  return allSpellOptions.filter(s => !selected.has(s.id));
}

function addSpellToLevel(level: number, spellId: string) {
  const key = level.toString();
  const current = model.value[key] ?? [];
  if (!current.includes(spellId)) {
    model.value = { ...model.value, [key]: [...current, spellId] };
  }
}

function removeSpellFromLevel(level: number, spellId: string) {
  const key = level.toString();
  const next = (model.value[key] ?? []).filter(id => id !== spellId);
  if (next.length === 0) {
    const copy = { ...model.value };
    delete copy[key];
    model.value = copy;
  } else {
    model.value = { ...model.value, [key]: next };
  }
}

function addLevel() {
  if (!addLevelValue.value) return;
  const key = addLevelValue.value.toString();
  if (model.value[key] === undefined) {
    model.value = { ...model.value, [key]: [] };
  }
  addLevelValue.value = "";
}
</script>
