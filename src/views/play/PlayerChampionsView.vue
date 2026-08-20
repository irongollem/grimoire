<template>
  <div class="max-w-2xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-heading-lg font-bold text-foreground">Champions</h1>
        <p class="text-body text-muted-foreground italic mt-0.5">Your characters in this campaign</p>
      </div>
      <AppButton
        variant="primary"
        size="sm"
        :to="{ name: 'play-character-create' }"
        :icon="IconAdd"
        label="New Character"
      />
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
      <AppButton
        variant="primary"
        size="md"
        :to="{ name: 'play-character-create' }"
        :icon="IconAdd"
        label="Create Character"
      />
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
                    class="shrink-0 text-label px-1.5 py-0.5 rounded bg-primary text-primary-foreground"
                  >Active</span>
                </div>
                <p class="text-caption text-muted-foreground italic mt-0.5 truncate">
                  {{ charSummary(char) }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 mt-2">
                <AppButton
                  v-if="!isActive(char)"
                  variant="subtle"
                  size="sm"
                  :disabled="settingActive === char.id"
                  @click="setActive(char.id)"
                >
                  {{ settingActive === char.id ? 'Switching…' : 'Set Active' }}
                </AppButton>
                <AppButton
                  variant="subtle"
                  size="sm"
                  :to="{ name: 'play-character-edit', query: { memberId: char.id } }"
                  label="Edit"
                />
                <AppButton
                  v-if="isActive(char) && char.level > 0"
                  variant="subtle"
                  size="sm"
                  :to="{ name: 'play-character-levelup', query: { memberId: char.id } }"
                  label="Level Up"
                />
                <AppButton
                  v-if="!ui.dmPreviewMode"
                  variant="subtle"
                  size="xs"
                  :disabled="cloning === char.id"
                  @click="cloneChar(char)"
                >
                  {{ cloning === char.id ? 'Cloning…' : 'Clone' }}
                </AppButton>
                <AppButton
                  v-if="!ui.dmPreviewMode"
                  variant="destructive"
                  size="xs"
                  :disabled="detaching === char.id"
                  @click="detach(char)"
                >
                  {{ detaching === char.id ? 'Leaving…' : 'Leave campaign' }}
                </AppButton>
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
                <AppButton
                  variant="primary"
                  size="sm"
                  :disabled="assuming === char.id"
                  @click="assume(char.id)"
                >
                  {{ assuming === char.id ? 'Assuming…' : 'Assume this character' }}
                </AppButton>
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
import { useRouter } from 'vue-router';
import { IconAdd, IconDM } from '@/lib/icons';
import { useMyCharacters, useSetActiveCharacter, useParty, useOfferedCharacters, useAssumeCharacter } from '@/composables/useParty';
import { useDetachCharacter, useCloneCharacter } from '@/composables/useCharacterPool';
import { useConfirm } from '@/composables/useConfirm';
import { useSpeciesNameMap } from '@/composables/useSpecies';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import AppButton from '@/components/common/AppButton.vue';
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

// #730 — a character is the player's, not the campaign's. Leaving detaches it
// back to the pool (progression intact); cloning copies it there for another
// table. Both land on the pool page, which is where the result is visible.
const router = useRouter();
const { confirm } = useConfirm();
const { mutateAsync: detachChar } = useDetachCharacter();
const { mutateAsync: cloneCharMut } = useCloneCharacter();
const detaching = ref<string | null>(null);
const cloning = ref<string | null>(null);

async function detach(char: PartyMember) {
  const ok = await confirm(
    `${char.name} will leave this campaign and return to your character pool, keeping their level, gear and gold. The DM will no longer see them.`,
    { title: 'Leave campaign?', confirmLabel: 'Leave', danger: true },
  );
  if (!ok) return;
  detaching.value = char.id;
  setActiveError.value = '';
  try {
    await detachChar(char.id);
    router.push({ name: 'play-home' });
  } catch (e) {
    setActiveError.value = e instanceof Error ? e.message : 'Failed to leave the campaign.';
  } finally {
    detaching.value = null;
  }
}

async function cloneChar(char: PartyMember) {
  cloning.value = char.id;
  setActiveError.value = '';
  try {
    await cloneCharMut(char.id);
    router.push({ name: 'play-home' });
  } catch (e) {
    setActiveError.value = e instanceof Error ? e.message : 'Failed to clone the character.';
  } finally {
    cloning.value = null;
  }
}
</script>
