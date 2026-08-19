<template>
  <!-- Concept -->
  <div>
    <label
      class="block text-label-lg font-semibold text-muted-foreground mb-1.5"
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
      class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      @input="emit('update:concept', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>

  <div class="gold-divider" />

  <!-- Quick options -->
  <div class="space-y-3">
    <p
      class="text-label-lg font-semibold text-muted-foreground"
    >
      QUICK OPTIONS
    </p>

    <div>
      <label class="block text-caption text-muted-foreground mb-1"
        >Name</label
      >
      <AppInput
        v-model="nameModel"
        placeholder="Leave blank to auto-generate"
        tone="muted"
        size="body"
      />
    </div>

    <div>
      <label class="block text-caption text-muted-foreground mb-1"
        >Species</label
      >
      <AppSelect v-model="raceModel" tone="muted" size="body" weight="normal" block>
        <option value="">Any</option>
        <option v-for="r in RACES" :key="r" :value="r">{{ r }}</option>
      </AppSelect>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-caption text-muted-foreground mb-1"
          >Alignment</label
        >
        <AppSelect v-model="alignmentModel" tone="muted" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="a in ALIGNMENTS" :key="a" :value="a">
            {{ a }}
          </option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1"
          >Relationship</label
        >
        <AppSelect v-model="relationshipModel" tone="muted" size="body" weight="normal" block>
          <option value="unknown">Unknown</option>
          <option value="hostile">Hostile</option>
          <option value="unfriendly">Unfriendly</option>
          <option value="indifferent">Indifferent</option>
          <option value="friendly">Friendly</option>
          <option value="helpful">Helpful</option>
        </AppSelect>
      </div>
    </div>

    <div>
      <label class="block text-caption text-muted-foreground mb-1"
        >Faction</label
      >
      <AppSelect v-model="factionIdModel" tone="muted" size="body" weight="normal" block>
        <option value="">None</option>
        <option v-for="f in factions" :key="f.id" :value="f.id">
          {{ f.name }}{{ f.faction_type ? ` (${f.faction_type})` : "" }}
        </option>
      </AppSelect>
    </div>

    <div v-if="quickForm.faction_id">
      <label class="block text-caption text-muted-foreground mb-1"
        >Role in faction</label
      >
      <AppSelect v-model="factionRoleModel" tone="muted" size="body" weight="normal" block>
        <option v-for="r in NPC_FACTION_ROLES" :key="r" :value="r">
          {{ r }}
        </option>
      </AppSelect>
    </div>

    <div>
      <label class="block text-caption text-muted-foreground mb-1"
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
      <label class="block text-caption text-muted-foreground mb-1"
        >Stat block template</label
      >
      <AppSelect v-model="templateIdModel" tone="muted" size="body" weight="normal" block>
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
      </AppSelect>
    </div>

    <div>
      <label class="block text-caption text-muted-foreground mb-1"
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
      <label class="block text-caption text-muted-foreground mb-1"
        >Relationship type</label
      >
      <AppSelect v-model="relatedNpcRelationshipModel" tone="muted" size="body" weight="normal" block>
        <option
          v-for="[type, label] in Object.entries(NPC_RELATIONSHIP_TYPE_LABELS)"
          :key="type"
          :value="type"
        >
          {{ label }}
        </option>
      </AppSelect>
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
        class="text-label-lg font-semibold text-foreground"
        >Generate Alter Ego</span
      >
    </label>
    <p
      v-if="generateAlterEgo"
      class="text-caption text-amber-500 italic"
    >
      ⚠ Uses 2× generation credits — a true-form portrait is generated
      first, then used as seed for the disguise portrait.
    </p>
    <p v-else class="text-caption text-muted-foreground italic">
      Also generate a disguised identity (name + portrait) for this NPC.
    </p>
  </div>

  <!-- Image toggle -->
  <div v-if="isAiEnabled" class="flex items-center justify-between">
    <span class="text-caption text-muted-foreground"
      >Generate portrait art</span
    >
    <ToggleSwitch v-model="generateImageModel" size="md" aria-label="Generate portrait art" />
  </div>

  <!-- Generating state -->
  <div
    v-if="isGenerating"
    class="flex flex-col items-center gap-3 py-4"
  >
    <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
    <p class="text-body text-muted-foreground italic text-center">
      {{ currentLoadingQuote }}
    </p>
    <AppButton
      variant="ghost"
      size="inline-caption"
      class="mt-1 underline underline-offset-2"
      @click="emit('dismiss-to-background')"
    >
      Continue in background
    </AppButton>
  </div>

  <!-- Error -->
  <div
    v-else-if="genError"
    class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
  >
    <p class="text-caption text-destructive">{{ genError }}</p>
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
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

// AppInput/AppSelect require a v-model. `quickForm` is a prop paired with a
// single `update:quickForm` emit (the parent wires it as v-model:quick-form)
// rather than individual local refs, so bridge each field through a writable
// computed — same idiom as SpellLevelAdvisorModal's `schoolModel`.
const nameModel = computed<QuickForm["name"]>({
  get: () => quickForm.name,
  set: (value) => patchForm("name", value),
});
const raceModel = computed<QuickForm["race"]>({
  get: () => quickForm.race,
  set: (value) => patchForm("race", value),
});
const alignmentModel = computed<QuickForm["alignment"]>({
  get: () => quickForm.alignment,
  set: (value) => patchForm("alignment", value),
});
const relationshipModel = computed<NpcRelationship>({
  get: () => quickForm.relationship,
  set: (value) => patchForm("relationship", value),
});
const factionIdModel = computed<QuickForm["faction_id"]>({
  get: () => quickForm.faction_id,
  set: (value) => patchForm("faction_id", value || null),
});
const factionRoleModel = computed<QuickForm["faction_role"]>({
  get: () => quickForm.faction_role,
  set: (value) => patchForm("faction_role", value),
});
const templateIdModel = computed<QuickForm["templateId"]>({
  get: () => quickForm.templateId,
  set: (value) => patchForm("templateId", value),
});
const relatedNpcRelationshipModel = computed<NpcRelationshipType>({
  get: () => quickForm.related_npc_relationship,
  set: (value) => patchForm("related_npc_relationship", value),
});
// ToggleSwitch requires a v-model; generateImage is a prop paired with a
// single update:generateImage emit, so bridge it the same way as the fields
// above rather than a local ref.
const generateImageModel = computed<boolean>({
  get: () => generateImage,
  set: (value) => emit("update:generateImage", value),
});

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
