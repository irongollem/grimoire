<template>
  <!-- Concept -->
  <div>
    <label
      class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5"
    >
      CONCEPT
      <span
        class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1"
        >(AI will use this)</span
      >
    </label>
    <textarea
      :value="concept"
      rows="3"
      placeholder="A mysterious tiefling bard who works as a city informant and hides a dark past…"
      class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      @input="emit('update:concept', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>

  <div class="gold-divider" />

  <!-- Quick options -->
  <div class="space-y-3">
    <p
      class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground"
    >
      QUICK OPTIONS
    </p>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Name</label
      >
      <input
        :value="quickForm.name"
        placeholder="Leave blank to auto-generate"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="patchForm('name', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Species</label
      >
      <select
        :value="quickForm.race"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="patchForm('race', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Any</option>
        <option v-for="r in RACES" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1"
          >Alignment</label
        >
        <select
          :value="quickForm.alignment"
          class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="patchForm('alignment', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Any</option>
          <option v-for="a in ALIGNMENTS" :key="a" :value="a">
            {{ a }}
          </option>
        </select>
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1"
          >Relationship</label
        >
        <select
          :value="quickForm.relationship"
          class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="patchForm('relationship', ($event.target as HTMLSelectElement).value as NpcRelationship)"
        >
          <option value="unknown">Unknown</option>
          <option value="hostile">Hostile</option>
          <option value="unfriendly">Unfriendly</option>
          <option value="indifferent">Indifferent</option>
          <option value="friendly">Friendly</option>
          <option value="helpful">Helpful</option>
        </select>
      </div>
    </div>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Faction</label
      >
      <select
        :value="quickForm.faction_id ?? ''"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="patchForm('faction_id', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">None</option>
        <option v-for="f in factions" :key="f.id" :value="f.id">
          {{ f.name }}{{ f.faction_type ? ` (${f.faction_type})` : "" }}
        </option>
      </select>
    </div>

    <div v-if="quickForm.faction_id">
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Role in faction</label
      >
      <select
        :value="quickForm.faction_role"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="patchForm('faction_role', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">
          {{ r }}
        </option>
      </select>
    </div>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Location</label
      >
      <EntityCombobox
        :model-value="quickForm.location_id ?? ''"
        :options="locationOptions"
        placeholder="— none —"
        @update:model-value="patchForm('location_id', $event || null)"
      >
        <template #option="{ opt }">
          <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
        </template>
      </EntityCombobox>
    </div>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Stat block template</label
      >
      <select
        :value="quickForm.templateId"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="patchForm('templateId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">None</option>
        <optgroup
          v-for="cat in templateCategories"
          :key="cat"
          :label="cat"
        >
          <option
            v-for="t in templatesByCategory(cat)"
            :key="t.id"
            :value="t.id"
          >
            {{ t.name }} (CR {{ t.stat_block.challenge_rating }})
          </option>
        </optgroup>
      </select>
    </div>

    <div>
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Known associate</label
      >
      <EntityCombobox
        :model-value="quickForm.related_npc_id ?? ''"
        :options="npcs ?? []"
        placeholder="— none —"
        @update:model-value="patchForm('related_npc_id', $event || null)"
      />
    </div>

    <div v-if="quickForm.related_npc_id">
      <label class="block font-fell text-xs text-muted-foreground mb-1"
        >Relationship type</label
      >
      <select
        :value="quickForm.related_npc_relationship"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="patchForm('related_npc_relationship', ($event.target as HTMLSelectElement).value as NpcRelationshipType)"
      >
        <option
          v-for="[type, label] in Object.entries(NPC_RELATIONSHIP_TYPE_LABELS)"
          :key="type"
          :value="type"
        >
          {{ label }}
        </option>
      </select>
    </div>
  </div>

  <!-- Alter ego toggle -->
  <div
    v-if="isAiEnabled"
    class="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-1.5"
  >
    <label class="flex items-center gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        :checked="generateAlterEgo"
        :disabled="!generateImage"
        class="rounded accent-primary"
        @change="emit('update:generateAlterEgo', ($event.target as HTMLInputElement).checked)"
      />
      <span
        class="font-cinzel text-[0.6875rem] font-semibold tracking-wider text-foreground"
        >Generate Alter Ego</span
      >
    </label>
    <p
      v-if="generateAlterEgo"
      class="font-fell text-[0.6875rem] text-amber-500 italic"
    >
      ⚠ Uses 2× generation credits — a true-form portrait is generated
      first, then used as seed for the disguise portrait.
    </p>
    <p v-else class="font-fell text-[0.6875rem] text-muted-foreground italic">
      Also generate a disguised identity (name + portrait) for this NPC.
    </p>
  </div>

  <!-- Image toggle -->
  <div v-if="isAiEnabled" class="flex items-center justify-between">
    <span class="font-fell text-xs text-muted-foreground"
      >Generate portrait art</span
    >
    <button
      type="button"
      class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
      :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
      @click="emit('update:generateImage', !generateImage)"
    >
      <span
        class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
        :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
      />
    </button>
  </div>

  <!-- Generating state -->
  <div
    v-if="isGenerating"
    class="flex flex-col items-center gap-3 py-4"
  >
    <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
    <p class="font-fell text-sm text-muted-foreground italic text-center">
      {{ currentLoadingQuote }}
    </p>
    <button
      type="button"
      class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      @click="emit('dismiss-to-background')"
    >
      Continue in background
    </button>
  </div>

  <!-- Error -->
  <div
    v-else-if="genError"
    class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
  >
    <p class="font-fell text-xs text-destructive">{{ genError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconGenerate } from "@/lib/icons";
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES } from "@/data/npcTemplates";
import type { NpcRelationship, NpcRelationshipType } from "@/types/npc.types";
import { NPC_RELATIONSHIP_TYPE_LABELS } from "@/types/npc.types";
import { NPC_FACTION_ROLES } from "@/types/faction.types";
import { useLocationTree } from "@/composables/useLocations";
import { useAllFactions } from "@/composables/useFactions";
import { useNpcs } from "@/composables/useNpcs";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import type { Location } from "@/types/location.types";

type LocationOption = Location & { depth: number };

export interface QuickForm {
  name: string;
  race: string;
  alignment: string;
  relationship: NpcRelationship;
  templateId: string;
  location_id: string | null;
  faction_id: string | null;
  faction_role: string;
  related_npc_id: string | null;
  related_npc_relationship: NpcRelationshipType;
}

const {
  concept,
  quickForm,
  generateAlterEgo,
  generateImage,
  isAiEnabled,
  isGenerating,
  genError = null,
} = defineProps<{
  concept: string;
  quickForm: QuickForm;
  generateAlterEgo: boolean;
  generateImage: boolean;
  isAiEnabled: boolean;
  isGenerating: boolean;
  genError?: string | null;
}>();

const emit = defineEmits<{
  "update:concept": [value: string];
  "update:quickForm": [value: QuickForm];
  "update:generateAlterEgo": [value: boolean];
  "update:generateImage": [value: boolean];
  "dismiss-to-background": [];
}>();

function patchForm<K extends keyof QuickForm>(key: K, value: QuickForm[K]) {
  emit("update:quickForm", { ...quickForm, [key]: value });
}

const RACES = [
  "Human", "Elf", "Half-Elf", "Dwarf", "Halfling", "Gnome",
  "Half-Orc", "Tiefling", "Dragonborn", "Aasimar", "Tabaxi",
  "Kenku", "Firbolg", "Goliath", "Triton",
] as const;

const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
] as const;

const { locationOptions } = useLocationTree();
const { data: factions } = useAllFactions();
const { data: npcs } = useNpcs();

const templateCategories = computed(() => NPC_TEMPLATE_CATEGORIES);
function templatesByCategory(cat: string) {
  return NPC_TEMPLATES.filter((t) => t.category === cat);
}
</script>
