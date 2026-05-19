<template>
  <div class="space-y-4">

    <!-- Background picker -->
    <div class="space-y-3">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">BACKGROUND</p>
      <div v-if="!allBackgrounds?.length" class="rounded-lg border border-border bg-card p-6 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">No backgrounds in the campaign yet — skip for now.</p>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button v-for="bg in allBackgrounds" :key="bg.id" type="button"
          class="rounded-lg border overflow-hidden text-left transition-all p-3"
          :class="f.background_id === bg.id
            ? 'border-primary ring-1 ring-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/40'"
          @click="onBackgroundSelect(bg.id)">
          <p class="font-cinzel text-sm font-bold text-foreground">{{ bg.name }}</p>
          <div v-if="bg.skill_proficiencies?.length" class="mt-1.5 flex flex-wrap gap-1">
            <span v-for="sk in bg.skill_proficiencies" :key="sk"
              class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[9px] text-primary">
              {{ sk }}
            </span>
          </div>
          <p v-if="bg.feature_name" class="font-fell text-xs text-muted-foreground mt-1.5 italic">{{ bg.feature_name }}</p>
          <p v-if="bg.source_title" class="font-cinzel text-[9px] text-muted-foreground/50 mt-1">{{ bg.source_title }}</p>
        </button>
      </div>

      <!-- Starting equipment preview -->
      <div v-if="selectedBg?.equipment" class="rounded-lg border border-primary/20 bg-primary/3 p-3 space-y-1">
        <p class="font-cinzel text-xs font-semibold text-primary/80 tracking-wider">STARTING EQUIPMENT</p>
        <p class="font-fell text-sm text-foreground/80 whitespace-pre-wrap">{{ selectedBg.equipment }}</p>
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
          Manage inventory import on the Equipment step →
        </p>
      </div>
    </div>

    <!-- Identity (collapsible) -->
    <div class="rounded-lg border border-border bg-card">
      <button type="button"
        class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        @click="showIdentity = !showIdentity">
        <span>IDENTITY — ALIGNMENT · AGE · APPEARANCE</span>
        <span class="text-base transition-transform" :class="showIdentity ? '' : '-rotate-90'">▾</span>
      </button>
      <div v-if="showIdentity" class="px-3 pb-3 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="field-label">Alignment</span>
            <select v-model="f.alignment" class="field-input w-full">
              <option value="">—</option>
              <option v-for="a in ALIGNMENT_OPTIONS" :key="a" :value="a">{{ a }}</option>
            </select>
          </label>
          <label class="block">
            <span class="field-label">Deity</span>
            <input v-model="f.deity" class="field-input w-full" placeholder="Tyr, Mielikki, none…" />
          </label>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <label class="block">
            <span class="field-label">Age</span>
            <input v-model="f.age" class="field-input w-full" placeholder="47, ancient…" />
          </label>
          <label class="block">
            <span class="field-label">Gender</span>
            <input v-model="f.gender" class="field-input w-full" />
          </label>
          <label class="block">
            <span class="field-label">Pronouns</span>
            <input v-model="f.pronouns" class="field-input w-full" placeholder="she/her" />
          </label>
        </div>
        <label class="block">
          <span class="field-label">Physical Description</span>
          <textarea v-model="f.physical_description" class="field-input w-full resize-y" rows="2"
            placeholder="Hair, build, scars, anything that helps the table picture them." />
        </label>
      </div>
    </div>

    <!-- Personality (collapsible) -->
    <div class="rounded-lg border border-border bg-card">
      <button type="button"
        class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        @click="showPersonality = !showPersonality">
        <span>PERSONALITY · IDEALS · BONDS · FLAWS</span>
        <span class="text-base transition-transform" :class="showPersonality ? '' : '-rotate-90'">▾</span>
      </button>
      <div v-if="showPersonality" class="px-3 pb-3 space-y-2">
        <label class="block">
          <span class="field-label">Personality Traits</span>
          <textarea v-model="f.personality_traits" rows="2" class="field-input w-full resize-y"
            placeholder="Two short traits that shape their behaviour." />
        </label>
        <label class="block">
          <span class="field-label">Ideals</span>
          <textarea v-model="f.ideals" rows="2" class="field-input w-full resize-y"
            placeholder="What drives them — justice, freedom, knowledge…" />
        </label>
        <label class="block">
          <span class="field-label">Bonds</span>
          <textarea v-model="f.bonds" rows="2" class="field-input w-full resize-y"
            placeholder="People, places, or artifacts they'd die for." />
        </label>
        <label class="block">
          <span class="field-label">Flaws</span>
          <textarea v-model="f.flaws" rows="2" class="field-input w-full resize-y"
            placeholder="One clear weakness that gets them in trouble." />
        </label>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">BACKSTORY &amp; NOTES</p>
      <RichTextEditor v-model="f.notes" placeholder="Background, goals, secrets…" min-height="80px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const { f, allBackgrounds, selectedBg, onBackgroundSelect } = form;

const showIdentity    = ref(false);
const showPersonality = ref(false);

const ALIGNMENT_OPTIONS = [
  "Lawful Good",    "Neutral Good",    "Chaotic Good",
  "Lawful Neutral", "True Neutral",    "Chaotic Neutral",
  "Lawful Evil",    "Neutral Evil",    "Chaotic Evil",
  "Unaligned",
] as const;
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
