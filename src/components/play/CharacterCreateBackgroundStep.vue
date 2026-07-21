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
          class="group rounded-lg border overflow-hidden text-left transition-all"
          :class="f.background_id === bg.id
            ? 'border-primary ring-1 ring-primary'
            : 'border-border bg-card hover:border-primary/40'"
          @click="onBackgroundSelect(bg.id)">

          <!-- Portrait thumbnail -->
          <div class="relative h-24 bg-muted overflow-hidden shrink-0">
            <FocalImage
              :src="bg.image_url"
              :alt="bg.name"
              format="landscape"
              :focal-point="bg.focal_point ?? null"
              placeholder="/assets/placeholders/background.webp"
              class="group-hover:scale-105 transition-transform duration-300"
            />
            <!-- Selected badge -->
            <div v-if="f.background_id === bg.id"
              class="absolute top-1.5 right-1.5 size-5 rounded-full bg-primary flex items-center justify-center">
              <IconCheck class="size-3 text-primary-foreground" />
            </div>
            <!-- Feat badge -->
            <div v-if="bg.feat_grant_name"
              class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 font-cinzel text-[0.5625rem] text-amber-300 tracking-wider leading-none">
              ✦ {{ bg.feat_grant_name }}
            </div>
          </div>

          <div class="p-2.5">
            <p class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ bg.name }}</p>
            <!-- Proficiencies summary -->
            <div class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="sk in bg.skill_proficiencies" :key="sk"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[0.5625rem] text-primary">
                {{ sk }}
              </span>
              <span v-for="t in bg.tool_proficiencies" :key="t"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[0.5625rem] text-muted-foreground">
                {{ t }}
              </span>
              <span v-if="bg.languages?.length"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[0.5625rem] text-muted-foreground">
                {{ bg.languages.length === 1 ? bg.languages[0] : `${bg.languages.length} languages` }}
              </span>
            </div>
            <p v-if="bg.feature_name" class="font-fell text-xs text-muted-foreground mt-1.5 italic line-clamp-1">
              {{ bg.feature_name }}
            </p>
            <p v-if="bg.source_title" class="font-cinzel text-[0.5625rem] text-muted-foreground/50 mt-1">
              {{ bg.source_title }}
            </p>
          </div>
        </button>
      </div>

      <!-- Feat grant preview -->
      <div v-if="selectedBg?.feat_grant_name"
        class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
        <div class="flex items-center gap-2">
          <p class="font-cinzel text-xs font-semibold text-amber-600 dark:text-amber-400 tracking-wider">FEAT GRANT</p>
          <span class="text-eyebrow text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
        </div>
        <p class="font-cinzel text-sm font-bold text-foreground">{{ selectedBg.feat_grant_name }}</p>
        <p v-if="selectedBg.feat_grant_description && typeof selectedBg.feat_grant_description === 'string' && !selectedBg.feat_grant_description.startsWith('{')"
          class="font-fell text-sm text-foreground/80">
          {{ selectedBg.feat_grant_description }}
        </p>
      </div>

      <!-- Starting equipment preview -->
      <div v-if="selectedBg?.equipment" class="rounded-lg border border-primary/20 bg-primary/3 p-3 space-y-1">
        <p class="font-cinzel text-xs font-semibold text-primary/80 tracking-wider">STARTING EQUIPMENT</p>
        <p class="font-fell text-sm text-foreground/80 whitespace-pre-wrap">{{ selectedBg.equipment }}</p>
        <p class="text-label text-muted-foreground">
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
          <!-- Deity: free-text + optional campaign deity suggestions -->
          <div class="block relative">
            <span class="field-label">Deity</span>
            <input
              v-model="f.deity"
              class="field-input w-full"
              placeholder="Tyr, Mielikki, none…"
              autocomplete="off"
              @input="f.deity_id = null"
              @focus="showDeityDropdown = true"
              @blur="hideDeityDropdown"
            />
            <ul
              v-if="showDeityDropdown && deityHints.length"
              class="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
            >
              <li
                v-for="d in deityHints"
                :key="d.id"
                class="flex items-baseline gap-1.5 px-3 py-2 font-fell text-sm text-foreground hover:bg-muted cursor-pointer"
                @mousedown.prevent="selectDeity(d.id, d.name)"
              >
                <span>{{ d.name }}</span>
                <span v-if="d.titles" class="text-muted-foreground text-xs truncate">— {{ d.titles }}</span>
              </li>
            </ul>
          </div>
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
          <RichTextEditor v-model="f.physical_description" min-height="4.5rem"
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
          <RichTextEditor v-model="f.personality_traits" min-height="4.5rem"
            placeholder="Two short traits that shape their behaviour." />
        </label>
        <label class="block">
          <span class="field-label">Ideals</span>
          <RichTextEditor v-model="f.ideals" min-height="4.5rem"
            placeholder="What drives them — justice, freedom, knowledge…" />
        </label>
        <label class="block">
          <span class="field-label">Bonds</span>
          <RichTextEditor v-model="f.bonds" min-height="4.5rem"
            placeholder="People, places, or artifacts they'd die for." />
        </label>
        <label class="block">
          <span class="field-label">Flaws</span>
          <RichTextEditor v-model="f.flaws" min-height="4.5rem"
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
import { ref, computed } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconCheck } from "@/lib/icons";
import { useAllDeities } from "@/composables/useDeities";
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const { f, allBackgrounds, selectedBg, onBackgroundSelect } = form;

const showIdentity    = ref(false);
const showPersonality = ref(false);

// ── Deity suggestions ────────────────────────────────────────────────────────
const { data: allDeities } = useAllDeities();
const showDeityDropdown = ref(false);

const deityHints = computed(() => {
  const list = allDeities.value ?? [];
  if (!list.length) return [];
  const q = (f.deity ?? "").toLowerCase().trim();
  const filtered = q
    ? list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.alternate_names?.some((n) => n.toLowerCase().includes(q)),
      )
    : list;
  return filtered.slice(0, 8);
});

function selectDeity(id: string, name: string) {
  f.deity    = name;
  f.deity_id = id;
  showDeityDropdown.value = false;
}

function hideDeityDropdown() {
  // Small delay so mousedown on a list item fires before blur hides the list
  setTimeout(() => { showDeityDropdown.value = false; }, 150);
}

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
