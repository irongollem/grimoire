<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div class="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-border">
            <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-violet-500/15 text-violet-400">
              <IconGenerate class="h-4.5 w-4.5" />
            </div>
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Add Innate Spell</h2>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 space-y-4">

            <!-- Spell search -->
            <div class="space-y-1">
              <label class="text-label-lg text-muted-foreground">SPELL</label>
              <div class="relative">
                <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  v-model="spellSearch"
                  type="text"
                  placeholder="Search by name…"
                  class="w-full bg-muted/30 border border-border rounded-md pl-8 pr-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  @input="selectedSpell = null"
                />
              </div>

              <!-- Selected spell display -->
              <div v-if="selectedSpell" class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-500/10 border border-violet-500/30">
                <div class="h-2 w-2 rounded-full shrink-0" :class="SCHOOL_BG[selectedSpell.school]" />
                <span class="text-body text-foreground flex-1">{{ selectedSpell.name }}</span>
                <span class="font-cinzel text-2xs text-muted-foreground">{{ selectedSpell.level === 0 ? 'Cantrip' : `Lvl ${selectedSpell.level}` }}</span>
                <button type="button" class="text-muted-foreground hover:text-foreground" @click="clearSpell">×</button>
              </div>

              <!-- IconSearch results -->
              <div
                v-else-if="searchResults.length > 0 && spellSearch.length >= 2"
                class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
              >
                <button
                  v-for="spell in searchResults"
                  :key="spell.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                  @click="pickSpell(spell)"
                >
                  <div class="h-2 w-2 rounded-full shrink-0" :class="SCHOOL_BG[spell.school]" />
                  <span class="text-body text-foreground flex-1 truncate">{{ spell.name }}</span>
                  <span class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ spell.level === 0 ? 'C' : spell.level }}</span>
                </button>
              </div>
              <p v-else-if="spellSearch.length >= 2 && !isSearching" class="text-caption text-muted-foreground italic px-1">No spells found</p>
            </div>

            <!-- Source type -->
            <div class="space-y-1">
              <label class="text-label-lg text-muted-foreground">SOURCE</label>
              <div class="flex rounded-md border border-border overflow-hidden text-label-lg font-semibold">
                <button
                  v-for="opt in SOURCE_TYPES"
                  :key="opt.value"
                  type="button"
                  class="flex-1 px-2.5 py-1.5 transition-colors"
                  :class="sourceType === opt.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                  @click="sourceType = opt.value"
                >{{ opt.label }}</button>
              </div>
            </div>

            <!-- Source label -->
            <div class="space-y-1">
              <label class="text-label-lg text-muted-foreground">SOURCE LABEL <span class="text-muted-foreground/60 normal-case font-fell">(required; e.g. Tiefling, Magic Initiate)</span></label>
              <input
                v-model="sourceLabel"
                type="text"
                placeholder="What grants this spell?"
                class="w-full bg-muted/30 border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <!-- Uses per day -->
            <div class="space-y-1">
              <label class="text-label-lg text-muted-foreground">USES</label>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="flex-1 py-1.5 rounded-md border text-label-lg font-semibold transition-colors"
                  :class="usesPerDay === null ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-card border-border text-muted-foreground hover:text-foreground'"
                  @click="setAtWill"
                >At will</button>
                <div class="flex items-center border border-border rounded-md overflow-hidden">
                  <button
                    type="button"
                    class="px-2.5 py-1.5 font-cinzel text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    :disabled="usesPerDay === null || usesInput <= 1"
                    @click="usesInput = Math.max(1, usesInput - 1); usesPerDay = usesInput"
                  >−</button>
                  <button
                    type="button"
                    class="px-3 py-1.5 font-cinzel text-xs font-semibold min-w-12 transition-colors"
                    :class="usesPerDay !== null ? 'bg-violet-500/15 text-violet-400' : 'bg-card text-muted-foreground'"
                    @click="setLimited"
                  >{{ usesPerDay !== null ? `${usesInput}/day` : 'N/day' }}</button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 font-cinzel text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    :disabled="usesPerDay === null"
                    @click="usesInput = usesInput + 1; usesPerDay = usesInput"
                  >+</button>
                </div>
              </div>
            </div>

            <!-- Resets on (only if limited) -->
            <div v-if="usesPerDay !== null" class="space-y-1">
              <label class="text-label-lg text-muted-foreground">RESETS ON</label>
              <div class="flex rounded-md border border-border overflow-hidden text-label-lg font-semibold">
                <button
                  type="button"
                  class="flex-1 px-3 py-1.5 transition-colors"
                  :class="resetsOn === 'long_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                  @click="resetsOn = 'long_rest'"
                >Long Rest</button>
                <button
                  type="button"
                  class="flex-1 px-3 py-1.5 transition-colors"
                  :class="resetsOn === 'short_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                  @click="resetsOn = 'short_rest'"
                >Short Rest</button>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-label-lg text-muted-foreground">CASTING ABILITY</label>
              <select v-model="castingAbility" class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-body text-foreground">
                <option :value="null">Use class/default ability</option>
                <option value="int">Intelligence</option>
                <option value="wis">Wisdom</option>
                <option value="cha">Charisma</option>
              </select>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              class="cursor-pointer px-4 py-1.5 rounded-md border border-border text-label-lg font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              @click="$emit('close')"
            >Cancel</button>
            <button
              type="button"
              class="cursor-pointer px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-label-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!selectedSpell || !sourceLabel.trim() || isPending"
              @click="submit"
            >Add Spell</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconGenerate, IconSearch } from '@/lib/icons';
import { useAddInnateSpell } from "@/composables/useCharacterSpells";
import { SCHOOL_BG } from "@/types/spell.types";
import type { Spell, InnateSourceType, InnateResetsOn } from "@/types/spell.types";
import { useSpellSearch } from "@/composables/useSpellSearch";

const SOURCE_TYPES = [
  { value: "racial" as InnateSourceType, label: "Racial" },
  { value: "feat"   as InnateSourceType, label: "Feat" },
  { value: "item"   as InnateSourceType, label: "Item" },
  { value: "other"  as InnateSourceType, label: "Other" },
] as const;

const props = defineProps<{
  open: boolean;
  partyMemberId: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

// ── Form state ─────────────────────────────────────────────────────────────────
const spellSearch   = ref("");
const selectedSpell = ref<Spell | null>(null);
const sourceType    = ref<InnateSourceType>("racial");
const sourceLabel   = ref("");
const usesPerDay    = ref<number | null>(null);
const usesInput     = ref(1);
const resetsOn      = ref<InnateResetsOn>("long_rest");
const castingAbility = ref<"int" | "wis" | "cha" | null>(null);

function reset() {
  spellSearch.value   = "";
  selectedSpell.value = null;
  sourceType.value    = "racial";
  sourceLabel.value   = "";
  usesPerDay.value    = null;
  usesInput.value     = 1;
  resetsOn.value      = "long_rest";
  castingAbility.value = null;
}

watch(() => props.open, (val) => { if (val) reset(); });

// ── Spell search ───────────────────────────────────────────────────────────────
const { results: searchResults, isSearching } = useSpellSearch(spellSearch, {
  enabled: () => !selectedSpell.value,
});

function pickSpell(spell: Spell) {
  selectedSpell.value = spell;
  spellSearch.value = "";
}

function clearSpell() {
  selectedSpell.value = null;
  spellSearch.value = "";
}

function setAtWill() {
  usesPerDay.value = null;
}

function setLimited() {
  usesPerDay.value = usesInput.value;
}

// ── Submit ─────────────────────────────────────────────────────────────────────
const { mutate: addInnate, isPending } = useAddInnateSpell();

function submit() {
  if (!selectedSpell.value || !props.partyMemberId) return;
  addInnate(
    {
      partyMemberId: props.partyMemberId,
      spellId: selectedSpell.value.id,
      sourceType: sourceType.value,
      sourceLabel: sourceLabel.value.trim(),
      usesPerDay: usesPerDay.value,
      resetsOn: usesPerDay.value !== null ? resetsOn.value : null,
      castingAbility: castingAbility.value,
    },
    { onSuccess: () => emit("close") },
  );
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
