<template>
  <!-- Portrait + name -->
  <div class="flex gap-4">
    <div class="w-28 shrink-0">
      <EntityImageBlock
        bucket="npc-portraits"
        :model-value="portraitUrl || null"
        :focal-point="focalPoint"
        show-focal-point
        ai-kind="party_member"
        :ai-target-id="memberId"
        :ai-context="aiContext"
        :mini-source="memberId ? { table: 'party_members', id: memberId } : undefined"
        @update:model-value="emit('update:portraitUrl', $event ?? '')"
        @update:focal-point="emit('update:focalPoint', $event)"
      />
    </div>
    <div class="flex-1 flex flex-col gap-2">
      <label class="block">
        <span class="field-label">Character Name *</span>
        <input
          :value="form.name"
          class="field-input w-full"
          placeholder="Aric Stormblade"
          @input="patch({ name: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="block">
        <span class="field-label">Player</span>
        <select
          :value="selectedCampaignMemberId"
          class="field-input w-full"
          @change="emit('update:selectedCampaignMemberId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— Unassigned —</option>
          <option v-for="p in players" :key="p.id" :value="p.id">
            {{ p.display_name || p.user_id.slice(0, 8) }}
          </option>
        </select>
        <p v-if="!players.length" class="text-caption text-muted-foreground/60 italic mt-1">
          No players have joined yet — share an invite link first.
        </p>
      </label>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div class="block">
      <span class="field-label">Species</span>
      <EntityCombobox
        :model-value="form.species_id ?? ''"
        :options="speciesOptions"
        placeholder="Select species…"
        @update:model-value="onSpeciesSelected"
      />
    </div>
    <div v-if="subraceOptions.length > 0" class="block">
      <span class="field-label">Variant</span>
      <select
        :value="form.subrace"
        class="field-input w-full"
        @change="patch({ subrace: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">— None —</option>
        <option v-for="sr in subraceOptions" :key="sr" :value="sr">{{ sr }}</option>
      </select>
    </div>

    <!-- Disguise species (shapeshifter only) -->
    <div v-if="form.species_id && isShapeshifter" class="col-span-2 rounded-md border border-border/60 bg-muted/20 p-3 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <span class="text-label-lg font-semibold text-muted-foreground uppercase">Disguise</span>
        <button
          v-if="form.disguise_species_id"
          type="button"
          class="text-caption text-muted-foreground hover:text-destructive transition-colors italic"
          @click="clearDisguise"
        >Clear disguise</button>
      </div>
      <p class="text-caption text-muted-foreground/70 italic -mt-1">
        Other players will see this species' full entry instead of the true race.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="field-label">Appears as</span>
          <EntityCombobox
            :model-value="form.disguise_species_id ?? ''"
            :options="speciesOptions"
            placeholder="Select disguise species…"
            @update:model-value="onDisguiseSpeciesSelected"
          />
        </div>
        <div v-if="disguiseSubraceOptions.length > 0">
          <span class="field-label">Disguise Variant</span>
          <select
            :value="form.disguise_subrace ?? ''"
            class="field-input w-full"
            @change="patch({ disguise_subrace: ($event.target as HTMLSelectElement).value || null })"
          >
            <option value="">— None —</option>
            <option v-for="sr in disguiseSubraceOptions" :key="sr" :value="sr">{{ sr }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Class / Subclass / Level — read-only when character has builder data -->
    <template v-if="hasBuilderData">
      <div class="col-span-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 flex items-center justify-between">
        <div>
          <span class="field-label block mb-0.5">Class</span>
          <span class="text-body text-foreground">
            {{ hasMulticlassData ? multiclassLabel : (form.class + (form.subclass ? ' — ' + form.subclass : '')) }}
          </span>
        </div>
        <RouterLink
          :to="{ name: 'play-character-levelup', query: { memberId, targetLevel: (hasMulticlassData ? multiclassTotal : form.level) + 1 } }"
          class="text-caption text-gold-400 hover:text-gold-300 underline italic transition-colors"
          @click="emit('close')"
        >Level Up →</RouterLink>
      </div>
    </template>
    <template v-else>
      <label class="block">
        <span class="field-label">Class</span>
        <select
          :value="form.class"
          class="field-input w-full"
          @change="patch({ class: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">— None —</option>
          <option v-for="c in allClassNames" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <div class="block">
        <span class="field-label">Subclass</span>
        <select
          v-if="subclassOptions.length > 0"
          :value="form.subclass"
          class="field-input w-full"
          @change="patch({ subclass: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">— None —</option>
          <option v-for="sc in subclassOptions" :key="sc" :value="sc">{{ sc }}</option>
        </select>
        <input
          v-else
          :value="form.subclass"
          class="field-input w-full"
          placeholder="Battle Master"
          @input="patch({ subclass: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </template>
    <label class="block">
      <span class="field-label">Level</span>
      <input
        v-if="!hasBuilderData"
        :value="form.level"
        type="number"
        min="1"
        max="20"
        class="field-input w-full"
        @change="patch({ level: Number(($event.target as HTMLInputElement).value) })"
      />
      <div v-else class="field-input bg-muted/30 text-muted-foreground flex items-center">
        {{ hasMulticlassData ? multiclassTotal : form.level }}
        <span class="ml-2 text-caption italic">total</span>
      </div>
    </label>
    <div>
      <label class="field-label">Proficiency Bonus</label>
      <div class="field-input bg-muted/30 text-muted-foreground flex items-center">
        +{{ profBonus }}
        <span class="ml-2 text-xs">(from level {{ form.level }})</span>
      </div>
    </div>
  </div>

  <label class="block">
    <span class="field-label">Height</span>
    <input
      :value="form.height ?? ''"
      class="field-input w-full"
      placeholder="e.g. 7'4&quot; or giant-sized"
      @input="patch({ height: ($event.target as HTMLInputElement).value || null })"
    />
  </label>
  <div>
    <span class="field-label">Notes</span>
    <RichTextEditor
      :model-value="form.notes"
      placeholder="Background, personality, goals…"
      min-height="120px"
      @update:model-value="patch({ notes: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { IdentityFormSlice } from "./partyMemberForm.types";
import { buildEntityContext } from "@/ai/utils";

interface CampaignMemberOption {
  id: string;
  user_id: string;
  display_name: string | null;
  party_member_id: string | null;
  role: string;
}

const {
  form,
  portraitUrl,
  focalPoint = null,
  players,
  selectedCampaignMemberId,
  speciesOptions,
  subraceOptions,
  disguiseSubraceOptions,
  isShapeshifter = false,
  hasBuilderData = false,
  hasMulticlassData = false,
  multiclassLabel = "",
  multiclassTotal = 0,
  memberId = null,
  allClassNames,
  subclassOptions,
  profBonus,
  allSpeciesMap,
} = defineProps<{
  form: IdentityFormSlice;
  portraitUrl: string;
  focalPoint?: { x: number; y: number } | null;
  players: CampaignMemberOption[];
  selectedCampaignMemberId: string;
  speciesOptions: Array<{ id: string; name: string }>;
  subraceOptions: string[];
  disguiseSubraceOptions: string[];
  isShapeshifter?: boolean;
  hasBuilderData?: boolean;
  hasMulticlassData?: boolean;
  multiclassLabel?: string;
  multiclassTotal?: number;
  memberId?: string | null;
  allClassNames: string[];
  subclassOptions: string[];
  profBonus: number;
  /** map of species id → name for disguise lookup */
  allSpeciesMap: Record<string, string>;
}>();

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    [allSpeciesMap[form.species_id ?? ""], form.subrace].filter(Boolean).join(" "),
    [form.class, form.subclass].filter(Boolean).join(" "),
    form.level ? `level ${form.level}` : "",
  ]),
);

const emit = defineEmits<{
  "update:form": [patch: Partial<IdentityFormSlice>];
  "update:portraitUrl": [value: string];
  "update:focalPoint": [value: { x: number; y: number } | null];
  "update:selectedCampaignMemberId": [value: string];
  close: [];
}>();

function patch(p: Partial<IdentityFormSlice>) {
  emit("update:form", p);
}

function onSpeciesSelected(id: string) {
  patch({ species_id: id || null, subrace: "" });
}

function onDisguiseSpeciesSelected(id: string) {
  const name = allSpeciesMap[id] ?? null;
  patch({ disguise_species_id: id || null, disguise_race: name, disguise_subrace: null });
}

function clearDisguise() {
  patch({ disguise_species_id: null, disguise_race: null, disguise_subrace: null });
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
