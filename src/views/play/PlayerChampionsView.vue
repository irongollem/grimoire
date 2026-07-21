<template>
  <div class="max-w-2xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-cinzel text-xl font-bold text-foreground">Champions</h1>
        <p class="text-body text-muted-foreground italic mt-0.5">Your characters in this campaign</p>
      </div>
      <RouterLink
        :to="{ name: 'play-character-create' }"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-label-lg font-semibold hover:opacity-90 transition-opacity"
      >
        <IconAdd class="h-3.5 w-3.5" />
        New Character
      </RouterLink>
    </div>

    <!-- Loading -->
    <div v-if="isPending" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Empty -->
    <div v-else-if="!characters?.length && !offeredCharacters?.length" class="rounded-lg border border-border bg-card p-8 text-center space-y-3">
      <IconDM class="h-8 w-8 text-muted-foreground/40 mx-auto" />
      <div>
        <p class="font-cinzel text-sm font-semibold text-foreground">No characters yet</p>
        <p class="text-body text-muted-foreground italic mt-1">Create your first champion to begin your adventure.</p>
      </div>
      <RouterLink
        :to="{ name: 'play-character-create' }"
        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-label-lg font-semibold hover:opacity-90 transition-opacity"
      >
        <IconAdd class="h-3.5 w-3.5" />
        Create Character
      </RouterLink>
    </div>

    <template v-else>
      <!-- Character cards -->
      <div v-if="characters?.length" class="space-y-3">
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
                :src="char.portrait_url"
                :alt="char.name"
                format="portrait"
                :focal-point="char.portrait_focal_point ?? null"
                :lightbox="true"
                placeholder="/assets/placeholders/character.webp"
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="font-cinzel text-sm font-bold text-foreground truncate">{{ char.name }}</h2>
                  <span
                    v-if="isActive(char)"
                    class="shrink-0 text-label md:text-sm px-1.5 py-0.5 rounded bg-primary text-primary-foreground"
                  >Active</span>
                </div>
                <p class="text-caption text-muted-foreground italic mt-0.5 truncate">
                  {{ charSummary(char) }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 mt-2">
                <button
                  v-if="!isActive(char)"
                  type="button"
                  :disabled="settingActive === char.id"
                  class="text-label-lg px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
                  @click="setActive(char.id)"
                >
                  {{ settingActive === char.id ? 'Switching…' : 'Set Active' }}
                </button>
                <RouterLink
                  :to="{ name: 'play-character-edit', query: { memberId: char.id } }"
                  class="text-label-lg px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </RouterLink>
                <RouterLink
                  v-if="isActive(char) && char.level > 0"
                  :to="{ name: 'play-character-levelup', query: { memberId: char.id } }"
                  class="text-label-lg px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
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

      <!-- Offered by DM -->
      <div v-if="!ui.dmPreviewMode && offeredCharacters?.length" class="space-y-3">
        <div class="flex items-center gap-2">
          <h2 class="font-cinzel text-sm font-semibold text-foreground">Available from your DM</h2>
          <span class="text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{{ offeredCharacters.length }}</span>
        </div>
        <div
          v-for="char in offeredCharacters"
          :key="char.id"
          class="rounded-lg border border-dashed border-border bg-card overflow-hidden"
        >
          <div class="flex gap-3 p-3">
            <!-- Portrait -->
            <div class="w-16 h-20 rounded-md overflow-hidden bg-muted shrink-0">
              <FocalImage
                :src="char.portrait_url"
                :alt="char.name"
                format="portrait"
                :focal-point="char.portrait_focal_point ?? null"
                :lightbox="true"
                placeholder="/assets/placeholders/character.webp"
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <h2 class="font-cinzel text-sm font-bold text-foreground truncate">{{ char.name }}</h2>
                <p class="text-caption text-muted-foreground italic mt-0.5 truncate">
                  {{ charSummary(char) }}
                </p>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  :disabled="assuming === char.id"
                  class="text-label-lg px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                  @click="assume(char.id)"
                >
                  {{ assuming === char.id ? 'Assuming…' : 'Assume this character' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Error -->
    <p v-if="setActiveError || assumeError" class="text-caption text-destructive text-center">
      {{ setActiveError || assumeError }}
    </p>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { IconAdd, IconDM } from '@/lib/icons';
import { useMyCharacters, useSetActiveCharacter, useParty, useOfferedCharacters, useAssumeCharacter } from '@/composables/useParty';
import { useSpeciesNameMap } from '@/composables/useSpecies';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import FocalImage from '@/components/common/FocalImage.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import type { PartyMember } from '@/types/party.types';

const auth = useAuthStore();
const ui   = useUiStore();
const { data: myChars,        isPending: myPending }  = useMyCharacters();
const { data: allChars,       isPending: allPending }  = useParty();
const { data: offeredCharacters } = useOfferedCharacters();
const characters = computed(() => ui.dmPreviewMode ? allChars.value  : myChars.value);
const isPending  = computed(() => ui.dmPreviewMode ? allPending.value : myPending.value);
const { mutateAsync: setActiveChar } = useSetActiveCharacter();
const { mutateAsync: assumeChar }    = useAssumeCharacter();
const speciesNameMap = useSpeciesNameMap();

const settingActive = ref<string | null>(null);
const setActiveError = ref('');
const assuming = ref<string | null>(null);
const assumeError = ref('');

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
  if (ui.dmPreviewMode) return;
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

async function assume(id: string) {
  assuming.value = id;
  assumeError.value = '';
  try {
    await assumeChar(id);
  } catch (e) {
    assumeError.value = e instanceof Error ? e.message : 'Failed to assume character.';
  } finally {
    assuming.value = null;
  }
}
</script>
