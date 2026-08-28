<template>
  <div>
    <AppButton
      v-if="!model"
      variant="link"
      size="inline"
      label="+ Add Spellcasting"
      @click="addSpellcasting"
    />

    <template v-else>
      <div class="flex items-center justify-between mb-3">
        <p class="text-label-lg font-semibold text-muted-foreground">SPELLCASTING</p>
        <AppButton
          variant="link"
          tone="danger"
          size="inline-xs"
          label="Remove"
          @click="model = null"
        />
      </div>

      <!-- Ability / DC / Attack Bonus -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <label class="block">
          <span class="field-label">Ability</span>
          <AppSelect v-model="abilityModel" tone="filled" weight="normal" size="body" block>
            <option value="">—</option>
            <option>INT</option>
            <option>WIS</option>
            <option>CHA</option>
          </AppSelect>
        </label>
        <label class="block">
          <span class="field-label">Spell Save DC</span>
          <AppInput
            v-model.number="saveDcModel"
            type="number"
            min="1"
            max="30"
            tone="filled"
            size="body"
            placeholder="15"
          />
        </label>
        <label class="block">
          <span class="field-label">Attack Bonus</span>
          <AppInput
            v-model.number="attackBonusModel"
            type="number"
            min="-5"
            max="20"
            tone="filled"
            size="body"
            placeholder="7"
          />
        </label>
      </div>

      <!-- Spell groups -->
      <div class="flex flex-col gap-4">
        <div
          v-for="(entry, i) in model.entries"
          :key="i"
          class="rounded-md border border-border bg-muted/30 p-3 space-y-2"
        >
          <div class="flex items-center gap-2">
            <AppInput
              :model-value="entry.frequency"
              type="text"
              placeholder="Frequency (e.g. at will, 3/day each, 1st level (4 slots))"
              tone="filled"
              size="body"
              class="flex-1"
              :block="false"
              @update:model-value="(v) => updateFrequency(i, v ?? '')"
            />
            <AppButton
              variant="ghost"
              tone="danger"
              size="icon-xs"
              icon-size="md"
              :icon="IconClose"
              aria-label="Remove spell group"
              class="shrink-0"
              @click="removeEntry(i)"
            />
          </div>

          <!-- Spell chips -->
          <div v-if="entry.spell_ids.length" class="flex flex-wrap gap-1">
            <span
              v-for="spellId in entry.spell_ids"
              :key="spellId"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-caption text-foreground"
            >
              {{ spellName(spellId) }}
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                class="leading-none"
                @click="removeSpell(i, spellId)"
              >×</AppButton>
            </span>
          </div>

          <!-- Spell search input -->
          <div class="relative" :ref="el => setSearchRef(i, el as HTMLElement | null)">
            <AppInput
              :model-value="searchQuery[i]"
              type="text"
              placeholder="Search spells to add…"
              tone="filled"
              size="body"
              @update:model-value="(v) => onSearchInput(i, v ?? '')"
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
                <li v-for="spell in filteredSpells(i)" :key="spell.id">
                  <AppButton
                    variant="menu"
                    size="body"
                    block
                    @mousedown.prevent="addSpell(i, spell.id)"
                  >
                    <span class="font-cinzel text-2xs text-muted-foreground w-16 shrink-0">{{ levelLabel(spell.level) }}</span>
                    {{ spell.name }}
                  </AppButton>
                </li>
              </ul>
              <div
                v-else-if="searchOpen[i] && (searchQuery[i]?.trim())"
                :style="dropdownStyle[i]"
                class="fixed z-9999 rounded-md border border-border bg-card shadow-lg px-3 py-2"
              >
                <span class="text-caption text-muted-foreground italic">No spells found</span>
              </div>
            </Teleport>
          </div>
        </div>
      </div>

      <AppButton
        variant="link"
        size="inline"
        label="+ Add Spell Group"
        class="mt-3"
        @click="addEntry"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, nextTick } from "vue";
import { useSpells } from "@/composables/spells/useSpells";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { IconClose } from "@/lib/icons";
import type { SpellcastingBlock, SpellcastingEntry, SpellcastingAbility } from "@/types/npc.types";

const model = defineModel<SpellcastingBlock | null>();
const props = defineProps<{
  abilityScores?: { int: number; wis: number; cha: number };
  proficiencyBonus?: number | null;
  challengeRating?: string;
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
  if (props.proficiencyBonus !== null && props.proficiencyBonus !== undefined) return props.proficiencyBonus;
  return crToProfBonus(props.challengeRating ?? "0");
});

function onAbilityChange(ability: string) {
  if (!model.value) return;
  const typedAbility = (ability || undefined) as SpellcastingAbility | undefined;
  const update: Partial<SpellcastingBlock> = { ability: typedAbility };
  if (typedAbility && props.abilityScores) {
    const score = props.abilityScores[typedAbility.toLowerCase() as "int" | "wis" | "cha"] ?? 10;
    const abilMod = Math.floor((score - 10) / 2);
    const prof = resolvedProfBonus.value;
    update.save_dc = 8 + prof + abilMod;
    update.attack_bonus = prof + abilMod;
  }
  model.value = { ...model.value, ...update };
}

// AppSelect's empty "—" option is a static value="", which is not itself a
// SpellcastingAbility — onAbilityChange already treats "" as "no ability" and
// derives save_dc/attack_bonus, so the model stays a plain string rather than
// a per-row computed that would just re-implement that same defaulting.
const abilityModel = computed<string>({
  get: () => model.value?.ability ?? "",
  set: (v) => onAbilityChange(v),
});

// save_dc / attack_bonus are optional numbers backed by an immutable-spread
// `patch()`, not a plain ref — a writable computed is the correct bridge here
// (not the `?? ''` anti-pattern UPDATE 1 warns about, which was for fields a
// plain v-model could have reached directly). Typed `number | null` rather
// than `| undefined` because AppInput's own empty-input coercion always
// emits `null` (see AppInput.vue's onInput) — same shape CalendarEditor's
// daysPerWeekModel already uses for the identical reason.
const saveDcModel = computed<number | null>({
  get: () => model.value?.save_dc ?? null,
  set: (v) => patch({ save_dc: v ?? undefined }),
});
const attackBonusModel = computed<number | null>({
  get: () => model.value?.attack_bonus ?? null,
  set: (v) => patch({ attack_bonus: v ?? undefined }),
});

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
  model.value = { entries: [{ frequency: "", spell_ids: [] }] };
}

function patch(partial: Partial<SpellcastingBlock>) {
  if (!model.value) return;
  model.value = { ...model.value, ...partial };
}

function updateEntries(entries: SpellcastingEntry[]) {
  if (!model.value) return;
  model.value = { ...model.value, entries };
}

function addEntry() {
  updateEntries([...(model.value?.entries ?? []), { frequency: "", spell_ids: [] }]);
}

function removeEntry(i: number) {
  const entries = [...(model.value?.entries ?? [])];
  entries.splice(i, 1);
  delete searchQuery[i];
  delete searchOpen[i];
  delete dropdownStyle[i];
  delete searchInputEls[i];
  updateEntries(entries);
}

function updateFrequency(i: number, frequency: string) {
  const entries = (model.value?.entries ?? []).map((e, idx) =>
    idx === i ? { ...e, frequency } : e
  );
  updateEntries(entries);
}

function addSpell(i: number, spellId: string) {
  const entries = (model.value?.entries ?? []).map((e, idx) => {
    if (idx !== i || e.spell_ids.includes(spellId)) return e;
    return { ...e, spell_ids: [...e.spell_ids, spellId] };
  });
  updateEntries(entries);
  searchQuery[i] = "";
}

function removeSpell(i: number, spellId: string) {
  const entries = (model.value?.entries ?? []).map((e, idx) =>
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
  const selectedIds = new Set(model.value?.entries[i]?.spell_ids ?? []);
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
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
