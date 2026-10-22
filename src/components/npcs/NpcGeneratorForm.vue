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
        placeholder="None"
        @update:model-value="patchForm('location_id', $event || null)"
      >
        <template #option="{ opt }">
          <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 0.75}rem` }">{{ opt.name }}</span>
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
      <div v-if="relatedPc" class="flex items-center justify-between gap-2 text-body text-foreground">
        <span>{{ relatedPc.name }} <span class="font-fell text-muted-foreground">(character)</span></span>
        <AppButton variant="subtle" size="sm" label="Clear" @click="patchMany({ related_pc_id: null, related_npc_kin: null, second_parent: null })" />
      </div>
      <EntityCombobox
        v-else
        :model-value="quickForm.related_npc_id ?? ''"
        :options="npcs ?? []"
        placeholder="None"
        @update:model-value="patchForm('related_npc_id', $event || null)"
      />
    </div>

    <div v-if="quickForm.related_npc_id || relatedPc">
      <label class="block text-caption text-muted-foreground mb-1"
        >Relationship</label
      >
      <AppSelect v-model="relationModel" tone="muted" size="body" weight="normal" block>
        <optgroup label="Family">
          <option v-for="kin in GENERATOR_KIN_RELATIONS" :key="kin" :value="`kin:${kin}`">
            {{ GENERATOR_KIN_LABELS[kin] }}
          </option>
        </optgroup>
        <optgroup v-if="!relatedPc" label="Bond">
          <option
            v-for="[type, label] in Object.entries(NPC_RELATIONSHIP_TYPE_LABELS)"
            :key="type"
            :value="`bond:${type}`"
          >
            {{ label }}
          </option>
        </optgroup>
      </AppSelect>
    </div>

    <div v-if="quickForm.related_npc_kin === 'child'">
      <label class="block text-caption text-muted-foreground mb-1"
        >and of
        <span class="font-fell font-normal normal-case text-muted-foreground">(optional second parent)</span></label
      >
      <EntityCombobox
        :model-value="quickForm.second_parent ?? ''"
        :options="secondParentOptions"
        placeholder="None"
        @update:model-value="onSecondParent($event)"
      />
    </div>
  </div>

  <!-- Alter ego toggle -->
  <div
    v-if="isAiEnabled"
    class="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-1.5"
  >
    <AppCheckbox
      :model-value="generateAlterEgo"
      :disabled="!generateImage"
      label-role="label-lg"
      label="Generate Alter Ego"
      label-tone="foreground"
      class="gap-2.5"
      @update:model-value="emit('update:generateAlterEgo', $event)"
    />
    <p
      v-if="generateAlterEgo"
      class="text-caption text-ink-caution italic"
    >
      ⚠ Uses 2× generation credits: a true-form portrait is generated
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
import { computed, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { IconGenerate } from "@/lib/icons";
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES } from "@/data/npcTemplates";
import type { NpcRelationship, NpcRelationshipType } from "@/types/npc.types";
import { NPC_RELATIONSHIP_TYPE_LABELS } from "@/types/npc.types";
import { NPC_FACTION_ROLES } from "@/types/faction.types";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useParty } from "@/composables/party/useParty";
import { useKinLinks } from "@/composables/kinship/useKinLinks";
import { personKey } from "@/lib/kinship/keys";
import {
  GENERATOR_KIN_LABELS,
  GENERATOR_KIN_RELATIONS,
  isGeneratorKin,
  onlySpouseOf,
  type GeneratorKinRelation,
} from "@/lib/npcGenerator/kinPrompt";
import type { PersonKey } from "@/types/kinship.types";
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
  /** What the new NPC is to the associate when the tie is family. Exclusive with a bond. */
  related_npc_kin: GeneratorKinRelation | null;
  /** A character as the associate (arrives by link; the combobox lists NPCs). */
  related_pc_id: string | null;
  /** The other parent when the new NPC is a child. */
  second_parent: PersonKey | null;
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
// One select holds the family group and the bond group; the form keeps them in two fields.
const relationModel = computed<string>({
  get: () =>
    quickForm.related_npc_kin
      ? `kin:${quickForm.related_npc_kin}`
      : `bond:${quickForm.related_npc_relationship}`,
  set: (value) => {
    const [group, rest] = value.split(":");
    if (group === "kin" && isGeneratorKin(rest)) {
      if (rest !== "child") resetSecondParent();
      patchMany(rest === "child" ? { related_npc_kin: rest } : { related_npc_kin: rest, second_parent: null });
    } else {
      resetSecondParent();
      patchMany({ related_npc_kin: null, related_npc_relationship: rest as NpcRelationshipType, second_parent: null });
    }
  },
});

function patchMany(patch: Partial<QuickForm>) {
  emit("update:quickForm", { ...quickForm, ...patch });
}

const { data: party } = useParty();
const { data: kinLinks } = useKinLinks();
const relatedPc = computed(() =>
  quickForm.related_pc_id ? (party.value ?? []).find((p) => p.id === quickForm.related_pc_id) ?? null : null,
);

const associateKey = computed<PersonKey | null>(() =>
  quickForm.related_pc_id
    ? personKey("pc", quickForm.related_pc_id)
    : quickForm.related_npc_id
      ? personKey("npc", quickForm.related_npc_id)
      : null,
);

const secondParentOptions = computed(() =>
  [
    ...(npcs.value ?? []).filter((n) => personKey("npc", n.id) !== associateKey.value).map((n) => ({ id: personKey("npc", n.id), name: n.name })),
    ...(party.value ?? []).filter((p) => personKey("pc", p.id) !== associateKey.value).map((p) => ({ id: personKey("pc", p.id), name: `${p.name} (character)` })),
  ],
);

// The associate's one current spouse is the likely other parent. It follows the
// associate until the DM picks or clears the field themselves.
let secondParentTouched = false;
let autoSecondParent: PersonKey | null = null;
function resetSecondParent() {
  secondParentTouched = false;
  autoSecondParent = null;
}
function onSecondParent(value: string) {
  secondParentTouched = true;
  patchForm("second_parent", value ? (value as PersonKey) : null);
}
watch([associateKey, () => quickForm.related_npc_kin, kinLinks], () => {
  if (quickForm.related_npc_kin !== "child" || !associateKey.value) return;
  const suggested = onlySpouseOf(kinLinks.value ?? [], associateKey.value);
  const followsAuto = quickForm.second_parent === autoSecondParent;
  if (secondParentTouched || !followsAuto || suggested === quickForm.second_parent) return;
  autoSecondParent = suggested;
  patchForm("second_parent", suggested);
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
