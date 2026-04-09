<template>
  <div>
    <button
      v-if="!modelValue"
      type="button"
      class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
      @click="addSpellcasting"
    >
      + Add Spellcasting
    </button>

    <template v-else>
      <div class="flex items-center justify-between mb-3">
        <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">SPELLCASTING</p>
        <button
          type="button"
          class="font-cinzel text-[10px] text-destructive hover:opacity-80 transition-opacity"
          @click="emit('update:modelValue', null)"
        >
          Remove
        </button>
      </div>

      <!-- Ability / DC / Attack Bonus -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <label class="block">
          <span class="field-label">Ability</span>
          <select
            :value="modelValue.ability ?? ''"
            class="field-input w-full"
            @change="onAbilityChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option>INT</option>
            <option>WIS</option>
            <option>CHA</option>
          </select>
        </label>
        <label class="block">
          <span class="field-label">Spell Save DC</span>
          <input
            :value="modelValue.save_dc ?? ''"
            type="number"
            min="1"
            max="30"
            class="field-input w-full"
            placeholder="15"
            @input="patch({ save_dc: ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined })"
          />
        </label>
        <label class="block">
          <span class="field-label">Attack Bonus</span>
          <input
            :value="modelValue.attack_bonus ?? ''"
            type="number"
            min="-5"
            max="20"
            class="field-input w-full"
            placeholder="7"
            @input="patch({ attack_bonus: ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined })"
          />
        </label>
      </div>

      <!-- Spell groups -->
      <div class="flex flex-col gap-4">
        <div
          v-for="(entry, i) in modelValue.entries"
          :key="i"
          class="rounded-md border border-border bg-muted/30 p-3 space-y-2"
        >
          <div class="flex items-center gap-2">
            <input
              :value="entry.frequency"
              type="text"
              placeholder="Frequency (e.g. at will, 3/day each, 1st level (4 slots))"
              class="field-input flex-1"
              @input="updateFrequency(i, ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none shrink-0"
              @click="removeEntry(i)"
            >
              ✕
            </button>
          </div>

          <!-- Spell chips -->
          <div v-if="entry.spell_ids.length" class="flex flex-wrap gap-1">
            <span
              v-for="spellId in entry.spell_ids"
              :key="spellId"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 font-fell text-xs text-foreground"
            >
              {{ spellName(spellId) }}
              <button
                type="button"
                class="text-muted-foreground hover:text-destructive transition-colors leading-none"
                @click="removeSpell(i, spellId)"
              >
                ×
              </button>
            </span>
          </div>

          <!-- Spell search input -->
          <div class="relative" :ref="el => setSearchRef(i, el as HTMLElement | null)">
            <input
              :value="searchQuery[i] ?? ''"
              type="text"
              placeholder="Search spells to add…"
              class="field-input w-full"
              @input="onSearchInput(i, ($event.target as HTMLInputElement).value)"
              @focus="openSearch(i)"
              @blur="closeSearch(i)"
              @keydown.enter.prevent="addFirstSpell(i)"
              @keydown.escape="closeSearch(i)"
            />
            <Teleport to="body">
              <ul
                v-if="searchOpen[i] && filteredSpells(i).length"
                :style="dropdownStyle[i]"
                class="fixed z-9999 max-h-52 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
              >
                <li
                  v-for="spell in filteredSpells(i)"
                  :key="spell.id"
                  class="px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex items-center gap-2"
                  @mousedown.prevent="addSpell(i, spell.id)"
                >
                  <span class="font-cinzel text-[10px] text-muted-foreground w-16 shrink-0">{{ levelLabel(spell.level) }}</span>
                  {{ spell.name }}
                </li>
              </ul>
              <div
                v-else-if="searchOpen[i] && (searchQuery[i]?.trim())"
                :style="dropdownStyle[i]"
                class="fixed z-9999 rounded-md border border-border bg-card shadow-lg px-3 py-2"
              >
                <span class="font-fell text-xs text-muted-foreground italic">No spells found</span>
              </div>
            </Teleport>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="mt-3 font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
        @click="addEntry"
      >
        + Add Spell Group
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, nextTick } from "vue";
import { useSpells } from "@/composables/useSpells";
import type { SpellcastingBlock, SpellcastingEntry, SpellcastingAbility } from "@/types/npc.types";

const props = defineProps<{
  modelValue?: SpellcastingBlock | null;
  abilityScores?: { int: number; wis: number; cha: number };
  proficiencyBonus?: number | null;
  challengeRating?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: SpellcastingBlock | null];
}>();

const { data: allSpells } = useSpells();

function crToProfBonus(cr: string): number {
  const n = cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : parseFloat(cr) || 0;
  if (n < 5) return 2;
  if (n < 9) return 3;
  if (n < 13) return 4;
  if (n < 17) return 5;
  if (n < 21) return 6;
  if (n < 25) return 7;
  if (n < 29) return 8;
  return 9;
}

const resolvedProfBonus = computed(() => {
  if (props.proficiencyBonus != null) return props.proficiencyBonus;
  return crToProfBonus(props.challengeRating ?? "0");
});

function onAbilityChange(ability: string) {
  if (!props.modelValue) return;
  const typedAbility = (ability || undefined) as SpellcastingAbility | undefined;
  const update: Partial<SpellcastingBlock> = { ability: typedAbility };
  if (typedAbility && props.abilityScores) {
    const score = props.abilityScores[typedAbility.toLowerCase() as "int" | "wis" | "cha"] ?? 10;
    const abilMod = Math.floor((score - 10) / 2);
    const prof = resolvedProfBonus.value;
    update.save_dc = 8 + prof + abilMod;
    update.attack_bonus = prof + abilMod;
  }
  emit("update:modelValue", { ...props.modelValue, ...update });
}

const spellMap = computed(() => {
  const m = new Map<string, string>();
  for (const s of allSpells.value ?? []) m.set(s.id, s.name);
  return m;
});

function spellName(id: string) {
  return spellMap.value.get(id) ?? "Unknown Spell";
}

function levelLabel(level: number) {
  if (level === 0) return "Cantrip";
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${level}${suffixes[level] ?? "th"} level`;
}

function addSpellcasting() {
  emit("update:modelValue", { entries: [{ frequency: "", spell_ids: [] }] });
}

function patch(partial: Partial<SpellcastingBlock>) {
  if (!props.modelValue) return;
  emit("update:modelValue", { ...props.modelValue, ...partial });
}

function updateEntries(entries: SpellcastingEntry[]) {
  if (!props.modelValue) return;
  emit("update:modelValue", { ...props.modelValue, entries });
}

function addEntry() {
  updateEntries([...(props.modelValue?.entries ?? []), { frequency: "", spell_ids: [] }]);
}

function removeEntry(i: number) {
  const entries = [...(props.modelValue?.entries ?? [])];
  entries.splice(i, 1);
  delete searchQuery[i];
  delete searchOpen[i];
  delete dropdownStyle[i];
  delete searchInputEls[i];
  updateEntries(entries);
}

function updateFrequency(i: number, frequency: string) {
  const entries = (props.modelValue?.entries ?? []).map((e, idx) =>
    idx === i ? { ...e, frequency } : e
  );
  updateEntries(entries);
}

function addSpell(i: number, spellId: string) {
  const entries = (props.modelValue?.entries ?? []).map((e, idx) => {
    if (idx !== i || e.spell_ids.includes(spellId)) return e;
    return { ...e, spell_ids: [...e.spell_ids, spellId] };
  });
  updateEntries(entries);
  searchQuery[i] = "";
}

function removeSpell(i: number, spellId: string) {
  const entries = (props.modelValue?.entries ?? []).map((e, idx) =>
    idx === i ? { ...e, spell_ids: e.spell_ids.filter(id => id !== spellId) } : e
  );
  updateEntries(entries);
}

const searchQuery = reactive<Record<number, string>>({});
const searchOpen = reactive<Record<number, boolean>>({});
const dropdownStyle = reactive<Record<number, Record<string, string>>>({});
const searchInputEls = reactive<Record<number, HTMLElement | null>>({});

function setSearchRef(i: number, el: HTMLElement | null) {
  searchInputEls[i] = el;
}

function filteredSpells(i: number) {
  const q = (searchQuery[i] ?? "").toLowerCase().trim();
  const selectedIds = new Set(props.modelValue?.entries[i]?.spell_ids ?? []);
  const candidates = (allSpells.value ?? []).filter(s => !selectedIds.has(s.id));
  if (!q) return candidates.slice(0, 50);
  return candidates.filter(s => s.name.toLowerCase().includes(q)).slice(0, 50);
}

function addFirstSpell(i: number) {
  const first = filteredSpells(i)[0];
  if (first) addSpell(i, first.id);
}

function updateDropdownPosition(i: number) {
  const container = searchInputEls[i];
  const input = container?.querySelector("input");
  if (!input) return;
  const rect = input.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < 212 && rect.top > spaceBelow;
  dropdownStyle[i] = openUpward
    ? { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${rect.left}px`, width: `${rect.width}px` }
    : { top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${rect.width}px` };
}

function openSearch(i: number) {
  searchOpen[i] = true;
  nextTick(() => updateDropdownPosition(i));
}

function closeSearch(i: number) {
  setTimeout(() => { searchOpen[i] = false; }, 150);
}

function onSearchInput(i: number, value: string) {
  searchQuery[i] = value;
  searchOpen[i] = true;
  nextTick(() => updateDropdownPosition(i));
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
