<template>
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">SPELL GRANTS</p>

    <!-- Existing grants -->
    <div v-if="grants.length" class="space-y-2 mb-3">
      <div
        v-for="(grant, i) in grants"
        :key="i"
        class="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
      >
        <div class="h-2 w-2 rounded-full shrink-0" :class="grant.spell_id ? 'bg-violet-400' : 'bg-amber-400'" />
        <span class="text-body text-foreground flex-1 truncate">{{ grant.spell_name }}</span>
        <span v-if="grant.subrace" class="font-cinzel text-2xs text-sky-400 shrink-0">{{ grant.subrace }}</span>
        <span v-if="!grant.spell_id" class="font-cinzel text-2xs text-amber-500 shrink-0">player picks</span>
        <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
          {{ grant.uses_per_day === null ? "At will" : `${grant.uses_per_day}/day` }}
          <template v-if="grant.uses_per_day !== null"> · {{ grant.resets_on === 'short_rest' ? 'SR' : 'LR' }}</template>
        </span>
        <span v-if="grant.min_level > 1" class="font-cinzel text-2xs text-amber-500 shrink-0">Lvl {{ grant.min_level }}+</span>
        <button type="button" class="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-sm" @click="emit('remove', i)">✕</button>
      </div>
    </div>

    <!-- Add grant form -->
    <div v-if="adding" class="rounded-md border border-border bg-muted/10 p-3 space-y-3 mb-3">
      <!-- Free pick toggle -->
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" v-model="grantForm.isFreePick" class="rounded" />
        <span class="text-label font-semibold text-muted-foreground">PLAYER CHOOSES SPELL (e.g. High Elf cantrip)</span>
      </label>

      <!-- Spell search (hidden for free pick) -->
      <div v-if="!grantForm.isFreePick" class="space-y-1">
        <label class="text-label font-semibold text-muted-foreground">SPELL</label>
        <div v-if="grantForm.spell" class="flex items-center gap-2 px-2 py-1.5 rounded bg-violet-500/10 border border-violet-500/30">
          <div class="h-2 w-2 rounded-full bg-violet-400 shrink-0" />
          <span class="text-body flex-1 truncate">{{ grantForm.spell.name }}</span>
          <span class="font-cinzel text-2xs text-muted-foreground">{{ grantForm.spell.level === 0 ? 'Cantrip' : `Lvl ${grantForm.spell.level}` }}</span>
          <button type="button" class="text-muted-foreground hover:text-foreground text-xs" @click="grantForm.spell = null; grantForm.spellSearch = ''">×</button>
        </div>
        <div v-else class="relative">
          <input
            v-model="grantForm.spellSearch"
            type="text"
            placeholder="Search spell…"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div
            v-if="spellResults.length > 0 && grantForm.spellSearch.length >= 2"
            class="absolute z-10 mt-1 w-full max-h-36 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border shadow-lg"
          >
            <button
              v-for="spell in spellResults"
              :key="spell.id"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
              @click="grantForm.spell = spell; grantForm.spellSearch = ''"
            >
              <span class="text-body text-foreground flex-1 truncate">{{ spell.name }}</span>
              <span class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ spell.level === 0 ? 'C' : spell.level }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Source label -->
      <div>
        <label class="text-eyebrow font-semibold text-muted-foreground">SOURCE LABEL</label>
        <input
          v-model="grantForm.sourceLabel"
          type="text"
          placeholder="e.g. Tiefling — Infernal Legacy"
          class="mt-1 w-full bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Subrace (only if species has subraces) -->
      <div v-if="subraceNames.length > 0">
        <label class="text-eyebrow font-semibold text-muted-foreground">APPLIES TO SUBRACE</label>
        <SegmentedControl
          v-model="subraceValue"
          size="xs"
          wrap
          class="mt-1"
          :options="subraceOptions"
        />
      </div>

      <!-- Uses + min level row -->
      <div class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="text-eyebrow font-semibold text-muted-foreground">USES</label>
          <div class="mt-1 flex rounded-md border border-border overflow-hidden text-label-lg font-semibold">
            <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.usesPerDay === null ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.usesPerDay = null">At will</button>
            <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.usesPerDay !== null ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.usesPerDay = grantForm.usesCount">{{ grantForm.usesPerDay !== null ? `${grantForm.usesCount}/day` : 'N/day' }}</button>
          </div>
          <div v-if="grantForm.usesPerDay !== null" class="mt-1 flex items-center border border-border rounded-md overflow-hidden">
            <AppButton
              variant="ghost"
              size="sm"
              class="text-sm"
              :disabled="grantForm.usesCount <= 1"
              label="−"
              @click="grantForm.usesCount = Math.max(1, grantForm.usesCount - 1); grantForm.usesPerDay = grantForm.usesCount"
            />
            <span class="flex-1 text-center font-cinzel text-xs font-semibold">{{ grantForm.usesCount }}</span>
            <AppButton
              variant="ghost"
              size="sm"
              class="text-sm"
              label="+"
              @click="grantForm.usesCount++; grantForm.usesPerDay = grantForm.usesCount"
            />
          </div>
        </div>
        <div v-if="grantForm.usesPerDay !== null" class="flex-1">
          <label class="text-label font-semibold text-muted-foreground">RESETS ON</label>
          <div class="mt-1 flex rounded-md border border-border overflow-hidden text-label-lg font-semibold">
            <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.resetsOn === 'long_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.resetsOn = 'long_rest'">Long</button>
            <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.resetsOn === 'short_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.resetsOn = 'short_rest'">Short</button>
          </div>
        </div>
        <div class="w-20">
          <label class="text-label font-semibold text-muted-foreground">MIN LEVEL</label>
          <input
            v-model.number="grantForm.minLevel"
            type="number" min="1" max="20"
            class="mt-1 w-full bg-card border border-border rounded-md px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label class="text-eyebrow font-semibold text-muted-foreground">CASTING ABILITY</label>
        <select v-model="grantForm.castingAbility" class="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-body text-foreground">
          <option :value="null">Class/default</option>
          <option value="int">Intelligence</option>
          <option value="wis">Wisdom</option>
          <option value="cha">Charisma</option>
        </select>
      </div>

      <div class="flex gap-2 pt-1">
        <AppButton variant="ghost" size="inline" label="Cancel" @click="cancel" />
        <AppButton
          variant="link"
          size="inline"
          :disabled="!grantForm.isFreePick && !grantForm.spell"
          label="Add Grant"
          @click="confirm"
        />
      </div>
    </div>

    <AppButton v-else variant="link" size="sm" label="+ Add Spell Grant" @click="adding = true" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SpeciesSpellGrant } from "@/types/species.types";
import type { Spell, InnateResetsOn } from "@/types/spell.types";
import { useSpellSearch } from "@/composables/useSpellSearch";

const { grants, subraceNames } = defineProps<{
  grants: SpeciesSpellGrant[];
  subraceNames: string[];
}>();

const emit = defineEmits<{
  add: [grant: SpeciesSpellGrant];
  remove: [index: number];
}>();

const adding = ref(false);

function makeGrantForm() {
  return {
    spell: null as Spell | null,
    spellSearch: "",
    isFreePick: false,
    sourceLabel: "",
    subrace: null as string | null,
    usesPerDay: null as number | null,
    usesCount: 1,
    resetsOn: "long_rest" as InnateResetsOn,
    minLevel: 1,
    castingAbility: null as "int" | "wis" | "cha" | null,
  };
}

const grantForm = reactive(makeGrantForm());

// SegmentedControl needs string|number values — "" stands in for the null
// (all-subraces) option.
const subraceValue = computed<string>({
  get: () => grantForm.subrace ?? "",
  set: (v) => { grantForm.subrace = v === "" ? null : v; },
});
const subraceOptions = computed(() => [
  { value: "", label: "All subraces" },
  ...subraceNames.map((name) => ({ value: name, label: name })),
]);

const { results: spellResults } = useSpellSearch(
  computed(() => grantForm.spellSearch),
  { limit: 10, enabled: () => !grantForm.spell },
);

function cancel() {
  adding.value = false;
  Object.assign(grantForm, makeGrantForm());
}

function confirm() {
  if (!grantForm.isFreePick && !grantForm.spell) return;
  const grant: SpeciesSpellGrant = {
    spell_id: grantForm.isFreePick ? null : grantForm.spell!.id,
    spell_name: grantForm.isFreePick
      ? (grantForm.sourceLabel.trim() || "Player's choice")
      : grantForm.spell!.name,
    uses_per_day: grantForm.usesPerDay,
    resets_on: grantForm.usesPerDay !== null ? grantForm.resetsOn : null,
    min_level: grantForm.minLevel ?? 1,
    source_label: grantForm.sourceLabel.trim() || (grantForm.isFreePick ? "Player's choice" : grantForm.spell!.name),
    subrace: grantForm.subrace,
    casting_ability: grantForm.castingAbility,
  };
  emit("add", grant);
  cancel();
}
</script>
