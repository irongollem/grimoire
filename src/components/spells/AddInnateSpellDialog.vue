<template>
  <AppModal
    :open="open"
    size="sm"
    labelled-by="add-innate-spell-title"
    @close="$emit('close')"
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3 border-b border-border">
      <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-violet-500/15 text-violet-400">
        <IconGenerate class="h-4.5 w-4.5" />
      </div>
      <h2 id="add-innate-spell-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">Add Innate Spell</h2>
    </div>

    <!-- Body. Scrolls because the shell caps the panel at the viewport where the
         old hand-rolled panel overflowed it: six fields plus a live search
         result list makes this the tallest dialog in this set. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

      <!-- Spell search -->
      <div class="space-y-1">
        <label class="text-label-lg text-muted-foreground">SPELL</label>
        <div class="relative">
          <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <AppInput
            v-model="spellSearch"
            tone="muted"
            size="body"
            placeholder="Search by name…"
            class="pl-8 pr-3"
            @input="selectedSpell = null"
          />
        </div>

        <!-- Selected spell display -->
        <div v-if="selectedSpell" class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-500/10 border border-violet-500/30">
          <div class="h-2 w-2 rounded-full shrink-0" :class="SCHOOL_BG[selectedSpell.school]" />
          <span class="text-body text-foreground flex-1">{{ selectedSpell.name }}</span>
          <span class="font-cinzel text-2xs text-muted-foreground">{{ selectedSpell.level === 0 ? 'Cantrip' : `Lvl ${selectedSpell.level}` }}</span>
          <AppButton variant="ghost" size="inline-xs" label="×" @click="clearSpell" />
        </div>

        <!-- IconSearch results -->
        <div
          v-else-if="searchResults.length > 0 && spellSearch.length >= 2"
          class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
        >
          <AppButton
            v-for="spell in searchResults"
            :key="spell.id"
            variant="menu"
            size="body"
            block
            class="rounded-none"
            @click="pickSpell(spell)"
          >
            <div class="h-2 w-2 rounded-full shrink-0" :class="SCHOOL_BG[spell.school]" />
            <span class="text-body text-foreground flex-1 truncate">{{ spell.name }}</span>
            <span class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ spell.level === 0 ? 'C' : spell.level }}</span>
          </AppButton>
        </div>
        <p v-else-if="spellSearch.length >= 2 && !isSearching" class="text-caption text-muted-foreground italic px-1">No spells found</p>
      </div>

      <!-- Source type -->
      <div class="space-y-1">
        <label class="text-label-lg text-muted-foreground">SOURCE</label>
        <SegmentedControl v-model="sourceType" :options="SOURCE_TYPES" size="sm" block />
      </div>

      <!-- Source label -->
      <div class="space-y-1">
        <label class="text-label-lg text-muted-foreground">SOURCE LABEL <span class="text-muted-foreground/60 normal-case font-fell">(required; e.g. Tiefling, Magic Initiate)</span></label>
        <AppInput
          v-model="sourceLabel"
          tone="muted"
          size="body"
          placeholder="What grants this spell?"
        />
      </div>

      <!-- Uses per day -->
      <div class="space-y-1">
        <label class="text-label-lg text-muted-foreground">USES</label>
        <div class="flex items-center gap-2">
          <AppButton
            :variant="usesPerDay === null ? 'tinted' : 'subtle'"
            tone="success"
            size="sm"
            label="At will"
            class="flex-1"
            @click="setAtWill"
          />
          <div class="flex items-center border border-border rounded-md overflow-hidden">
            <AppButton
              variant="ghost"
              fill="muted"
              size="sm"
              class="rounded-none"
              label="−"
              :disabled="usesPerDay === null || usesInput <= 1"
              @click="usesInput = Math.max(1, usesInput - 1); usesPerDay = usesInput"
            />
            <AppButton
              variant="ghost"
              surface="card"
              tone="arcane"
              :active="usesPerDay !== null"
              size="sm"
              class="rounded-none min-w-12"
              :label="usesPerDay !== null ? `${usesInput}/day` : 'N/day'"
              @click="setLimited"
            />
            <AppButton
              variant="ghost"
              fill="muted"
              size="sm"
              class="rounded-none"
              label="+"
              :disabled="usesPerDay === null"
              @click="usesInput = usesInput + 1; usesPerDay = usesInput"
            />
          </div>
        </div>
      </div>

      <!-- Resets on (only if limited) -->
      <div v-if="usesPerDay !== null" class="space-y-1">
        <label class="text-label-lg text-muted-foreground">RESETS ON</label>
        <SegmentedControl v-model="resetsOn" :options="RESETS_ON_OPTIONS" size="sm" block />
      </div>

      <div class="space-y-1">
        <label class="text-label-lg text-muted-foreground">CASTING ABILITY</label>
        <AppSelect v-model="castingAbility" tone="muted" size="body" block>
          <option :value="null">Use class/default ability</option>
          <option value="int">Intelligence</option>
          <option value="wis">Wisdom</option>
          <option value="cha">Charisma</option>
        </AppSelect>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton
        variant="subtle"
        size="sm"
        label="Cancel"
        @click="$emit('close')"
      />
      <AppButton
        variant="primary"
        size="sm"
        label="Add Spell"
        :disabled="!selectedSpell || !sourceLabel.trim() || isPending"
        @click="submit"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconGenerate, IconSearch } from '@/lib/icons';
import { useAddInnateSpell } from "@/composables/useCharacterSpells";
import { SCHOOL_BG } from "@/types/spell.types";
import type { Spell, InnateSourceType, InnateResetsOn } from "@/types/spell.types";
import { useSpellSearch } from "@/composables/useSpellSearch";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const SOURCE_TYPES = [
  { value: "racial" as InnateSourceType, label: "Racial" },
  { value: "feat"   as InnateSourceType, label: "Feat" },
  { value: "item"   as InnateSourceType, label: "Item" },
  { value: "other"  as InnateSourceType, label: "Other" },
] as const;

const RESETS_ON_OPTIONS = [
  { value: "long_rest" as InnateResetsOn, label: "Long Rest" },
  { value: "short_rest" as InnateResetsOn, label: "Short Rest" },
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
