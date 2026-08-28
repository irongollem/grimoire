<template>
  <div class="space-y-5">

    <!-- Portrait + name -->
    <div class="flex gap-4">
      <div class="w-28 shrink-0">
        <ImageUpload bucket="npc-portraits" :model-value="portraitUrl || null" :focal-point="focalPoint"
          show-focal-point
          @update:model-value="portraitUrl = $event ?? ''"
          @update:focal-point="focalPoint = $event" />
      </div>
      <div class="flex-1 flex flex-col gap-2">
        <label class="block">
          <span class="field-label">Character Name *</span>
          <AppInput v-model="f.name" tone="filled" size="body" placeholder="Aric Stormblade" autofocus />
        </label>
        <label class="block">
          <span class="field-label">Player Name</span>
          <AppInput v-model="f.player_name" tone="filled" size="body"
            :placeholder="auth.membership?.display_name ?? 'Your name'" />
        </label>
      </div>
    </div>

    <!-- Species picker -->
    <div class="space-y-3">
      <p class="text-label-lg font-semibold text-muted-foreground">SPECIES</p>
      <div v-if="!speciesChoices?.length" class="rounded-lg border border-border bg-card p-6 text-center">
        <p class="text-body text-muted-foreground italic">No species in the campaign yet — skip for now.</p>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button v-for="sp in speciesChoices" :key="sp.id" type="button"
          class="rounded-lg border overflow-hidden text-left transition-all"
          :class="f.species_id === sp.id
            ? 'border-primary ring-1 ring-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/40'"
          @click="onSpeciesSelect(sp.id)">
          <div v-if="sp.image_url" class="h-24 overflow-hidden bg-muted">
            <FocalImage :src="sp.image_url" :alt="sp.name" format="landscape"
              :focal-point="sp.focal_point ?? null" />
          </div>
          <div class="px-3 py-2 flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-bold text-foreground">{{ sp.name }}</p>
              <p v-if="sp.traits?.length" class="text-caption text-muted-foreground mt-0.5 line-clamp-1">
                {{ sp.traits.slice(0, 3).map((t) => t.name).join(' · ') }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span v-if="sp.size"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground capitalize">
                {{ sp.size }}
              </span>
              <span v-if="sp.subraces?.length" class="font-cinzel text-2xs text-muted-foreground/60">
                {{ sp.subraces.length }} variant{{ sp.subraces.length > 1 ? 's' : '' }}
              </span>
            </div>
          </div>
        </button>
      </div>

      <!-- Subrace picker -->
      <div v-if="subraceOptions.length > 0"
        class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p class="text-label-lg font-semibold text-primary">CHOOSE A VARIANT</p>
        <div class="flex flex-wrap gap-2">
          <AppButton
            v-for="sr in subraceOptions" :key="sr"
            variant="subtle"
            size="sm"
            :active="f.subrace === sr"
            surface="card"
            :label="sr"
            @click="f.subrace = f.subrace === sr ? '' : sr"
          />
        </div>
      </div>

      <p v-if="f.species_id" class="text-label-lg text-primary/70 text-center">
        ✓ {{ selectedSpecies?.name }} selected{{ f.subrace ? ` — ${f.subrace}` : '' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import ImageUpload from "@/components/common/ImageUpload.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { CharacterCreationForm } from "@/composables/party/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const { f, auth, portraitUrl, focalPoint, speciesChoices, selectedSpecies, subraceOptions, onSpeciesSelect } = form;
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
