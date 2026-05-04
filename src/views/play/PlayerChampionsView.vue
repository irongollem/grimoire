<template>
  <div class="max-w-2xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-cinzel text-xl font-bold text-foreground">Champions</h1>
        <p class="font-fell text-sm text-muted-foreground italic mt-0.5">Your characters in this campaign</p>
      </div>
      <RouterLink
        :to="{ name: 'play-character-create' }"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Character
      </RouterLink>
    </div>

    <!-- Loading -->
    <div v-if="isPending" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Empty -->
    <div v-else-if="!characters?.length" class="rounded-lg border border-border bg-card p-8 text-center space-y-3">
      <Crown class="h-8 w-8 text-muted-foreground/40 mx-auto" />
      <div>
        <p class="font-cinzel text-sm font-semibold text-foreground">No characters yet</p>
        <p class="font-fell text-sm text-muted-foreground italic mt-1">Create your first champion to begin your adventure.</p>
      </div>
      <RouterLink
        :to="{ name: 'play-character-create' }"
        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        Create Character
      </RouterLink>
    </div>

    <!-- Character cards -->
    <div v-else class="space-y-3">
      <div
        v-for="char in characters"
        :key="char.id"
        class="rounded-lg border bg-card overflow-hidden transition-colors"
        :class="isActive(char) ? 'border-primary/50' : 'border-border'"
      >
        <div class="flex gap-3 p-3">

          <!-- Portrait -->
          <div class="w-16 h-20 rounded-md overflow-hidden bg-muted shrink-0">
            <FocalImage
              v-if="char.portrait_url"
              :src="char.portrait_url"
              :alt="char.name"
              format="portrait"
              :focal-point="char.portrait_focal_point ?? null"
              :lightbox="true"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
              <UserIcon class="h-6 w-6" />
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-cinzel text-sm font-bold text-foreground truncate">{{ char.name }}</h2>
                <span
                  v-if="isActive(char)"
                  class="shrink-0 font-cinzel text-2xs md:text-sm px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider"
                >Active</span>
              </div>
              <p class="font-fell text-xs text-muted-foreground italic mt-0.5 truncate">
                {{ charSummary(char) }}
              </p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 mt-2">
              <button
                v-if="!isActive(char)"
                type="button"
                :disabled="settingActive === char.id"
                class="font-cinzel text-xs tracking-wider px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
                @click="setActive(char.id)"
              >
                {{ settingActive === char.id ? 'Switching…' : 'Set Active' }}
              </button>
              <RouterLink
                :to="{ name: 'play-character-edit', query: { memberId: char.id } }"
                class="font-cinzel text-xs tracking-wider px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </RouterLink>
              <RouterLink
                v-if="isActive(char) && char.level > 0"
                :to="{ name: 'play-character-levelup', query: { memberId: char.id } }"
                class="font-cinzel text-xs tracking-wider px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Level Up
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Active indicator bar -->
        <div v-if="isActive(char)" class="h-0.5 bg-primary/40" />
      </div>
    </div>

    <!-- Error -->
    <p v-if="setActiveError" class="font-fell text-xs text-destructive text-center">
      {{ setActiveError }}
    </p>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Crown, Plus, User as UserIcon } from 'lucide-vue-next';
import { useMyCharacters, useSetActiveCharacter } from '@/composables/useParty';
import { useSpeciesNameMap } from '@/composables/useSpecies';
import { useAuthStore } from '@/stores/auth';
import FocalImage from '@/components/common/FocalImage.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import type { PartyMember } from '@/types/party.types';

const auth = useAuthStore();
const { data: characters, isPending } = useMyCharacters();
const { mutateAsync: setActiveChar } = useSetActiveCharacter();
const speciesNameMap = useSpeciesNameMap();

const settingActive = ref<string | null>(null);
const setActiveError = ref('');

function isActive(char: PartyMember): boolean {
  return char.id === auth.linkedPartyMemberId;
}

function charSummary(char: PartyMember): string {
  const parts: string[] = [];
  const species = speciesNameMap.value.get(char.species_id ?? '');
  if (species) parts.push(species);
  if (char.class) {
    parts.push(char.subclass ? `${char.class} (${char.subclass})` : char.class);
  }
  const levelStr = char.level ? `· Level ${char.level}` : '· Not yet levelled';
  return parts.length ? `${parts.join(' ')} ${levelStr}` : levelStr;
}

async function setActive(id: string) {
  settingActive.value = id;
  setActiveError.value = '';
  try {
    await setActiveChar(id);
  } catch (e) {
    setActiveError.value = e instanceof Error ? e.message : 'Failed to switch character.';
  } finally {
    settingActive.value = null;
  }
}
</script>
