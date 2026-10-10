<template>
  <div class="max-w-2xl mx-auto space-y-6">

    <PageHeader flush title="Champions" description="Your characters in this campaign">
      <template #actions>
      <AppButton
        variant="primary"
        size="sm"
        :to="{ name: 'play-character-create' }"
        :icon="IconAdd"
        label="New Character"
      />
      </template>
    </PageHeader>

    <!-- Loading -->
    <ListSkeleton v-if="isPending" variant="rows" :count="3" />

    <!-- Empty -->
    <div v-else-if="!characters?.length && !offeredCharacters?.length" class="rounded-lg border border-border bg-card p-8 text-center space-y-3">
      <IconDM class="h-8 w-8 text-muted-foreground/40 mx-auto" />
      <div>
        <template v-if="laidToRest.length">
          <p class="text-heading-sm font-semibold text-foreground">No champion at the table</p>
          <p class="text-body text-muted-foreground italic mt-1">Your champions rest in the Hall of the Fallen. Bring a new one to the table.</p>
        </template>
        <template v-else>
          <p class="text-heading-sm font-semibold text-foreground">No characters yet</p>
          <p class="text-body text-muted-foreground italic mt-1">Create your first champion to begin your adventure.</p>
        </template>
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
                :placeholder="placeholderUrl('character')"
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-heading-xs font-bold text-foreground truncate">{{ char.name }}</h2>
                  <span
                    v-if="isActive(char)"
                    class="shrink-0 text-label px-1.5 py-0.5 rounded bg-primary text-primary-foreground"
                  >Active</span>
                </div>
                <p class="text-caption text-muted-foreground italic mt-0.5 truncate">
                  {{ charSummary(char, speciesNameOf(char)) }}
                </p>
                <CharacterEditionNotice
                  v-if="activeCampaign"
                  :member="char"
                  :campaign="activeCampaign"
                  class="mt-1.5"
                />
                <CharacterApprovalNotice :member="char" class="mt-1.5" />
              </div>

              <!-- Actions: the primaries at touch size, Clone and Leave tucked into a menu so they are never a stray tap apart. -->
              <div class="flex flex-wrap items-center gap-2 mt-2">
                <AppButton
                  v-if="!isActive(char)"
                  variant="subtle"
                  size="md"
                  class="whitespace-nowrap"
                  :disabled="settingActive === char.id || isWaiting(char)"
                  @click="setActive(char.id)"
                >
                  {{ settingActive === char.id ? 'Switching…' : 'Set active' }}
                </AppButton>
                <AppButton
                  v-if="isActive(char) && char.level > 0"
                  variant="primary"
                  size="md"
                  class="whitespace-nowrap"
                  :to="{ name: 'play-character-levelup', query: { memberId: char.id } }"
                  label="Level up"
                />
                <AppButton
                  variant="subtle"
                  size="md"
                  class="whitespace-nowrap"
                  :to="{ name: 'play-character-edit', query: { memberId: char.id } }"
                  label="Edit"
                />
                <OverflowMenu
                  v-if="!ui.dmPreviewMode"
                  :label="`More actions for ${char.name}`"
                  :items="menuItems(char)"
                  @select="(key) => onMenu(key, char)"
                />
              </div>
              <p v-if="!isActive(char) && isWaiting(char)" class="text-caption text-muted-foreground italic mt-1.5">
                Waiting for the DM's approval
              </p>
            </div>
          </div>

          <!-- Active indicator bar -->
          <div v-if="isActive(char)" class="h-0.5 bg-primary/40" />
        </div>
      </div>

      <!-- Offered by DM -->
      <div v-if="!ui.dmPreviewMode && offeredCharacters?.length" class="space-y-3">
        <div class="flex items-center gap-2">
          <h2 class="text-heading-sm font-semibold text-foreground">Available from your DM</h2>
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
                :placeholder="placeholderUrl('character')"
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <h2 class="text-heading-xs font-bold text-foreground truncate">{{ char.name }}</h2>
                <p class="text-caption text-muted-foreground italic mt-0.5 truncate">
                  {{ charSummary(char, speciesNameOf(char)) }}
                </p>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <AppButton
                  variant="primary"
                  size="md"
                  :disabled="assuming === char.id"
                  @click="assume(char)"
                >
                  {{ assuming === char.id ? 'Taking on…' : 'Play this character' }}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <p
      v-for="char in laidToRest"
      :key="char.id"
      class="text-caption text-muted-foreground italic text-center"
    >
      <RouterLink to="/play/fallen" class="hover:text-foreground">{{ char.name }} rests in the Hall of the Fallen</RouterLink>
    </p>

    <!-- Error -->
    <p v-if="setActiveError || assumeError" class="text-caption text-destructive text-center">
      {{ setActiveError || assumeError }}
    </p>

  </div>
</template>

<script setup lang="ts">
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { IconAdd, IconDM } from '@/lib/icons';
import { useMyCharacters, useSetActiveCharacter, useParty, useOfferedCharacters, useAssumeCharacter } from '@/composables/party/useParty';
import { useDetachCharacter, useCloneCharacter } from '@/composables/party/useCharacterPool';
import { useConfirm } from '@/composables/useConfirm';
import { useSpeciesNames } from '@/composables/rules/useSpecies';
import { useAuthStore } from '@/stores/auth';
import { useCampaignStore } from '@/stores/campaign';
import CharacterEditionNotice from '@/components/player/CharacterEditionNotice.vue';
import CharacterApprovalNotice from '@/components/player/CharacterApprovalNotice.vue';
import { isApprovalWait, useCampaignPendingContentReviews } from '@/composables/party/useCharacterContentReviews';
import { useUiStore } from '@/stores/ui';
import AppButton from '@/components/common/AppButton.vue';
import OverflowMenu, { type OverflowMenuEntry } from '@/components/common/OverflowMenu.vue';
import { useToast } from '@/composables/useToast';
import FocalImage from '@/components/common/FocalImage.vue';
import type { PartyMember } from '@/types/party.types';
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { activeMembers } from "@/composables/party/useActiveParty";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";

const auth = useAuthStore();
const ui   = useUiStore();
const { activeCampaign } = storeToRefs(useCampaignStore());
const { data: myChars,        isPending: myPending }  = useMyCharacters();
const { data: allChars,       isPending: allPending }  = useParty();
const { data: allOffered } = useOfferedCharacters();
// An original the player already took a copy of is not offered to them again.
const offeredCharacters = computed(() => {
  const taken = new Set((myChars.value ?? []).map((c) => c.assumed_from_id));
  return (allOffered.value ?? []).filter((c) => !taken.has(c.id));
});
// Fallen and retired characters leave the active list but keep their row.
const { data: memorials } = useCampaignMemorials();
const activeOf = (members: PartyMember[] | undefined) =>
  members && memorials.value ? activeMembers(members, memorials.value) : members;
const characters = computed(() => activeOf(ui.dmPreviewMode ? allChars.value : myChars.value));
const laidToRest = computed(() => {
  const mine = myChars.value;
  if (ui.dmPreviewMode || !mine || !memorials.value) return [];
  const active = new Set(activeMembers(mine, memorials.value).map((c) => c.id));
  return mine.filter((c) => !active.has(c.id));
});
const speciesNameOf = useSpeciesNames(() => [...(characters.value ?? []), ...(offeredCharacters.value ?? [])]);
const isPending  = computed(() => ui.dmPreviewMode ? allPending.value : myPending.value);
const { mutateAsync: setActiveChar } = useSetActiveCharacter();
const { mutateAsync: assumeChar }    = useAssumeCharacter();

const settingActive = ref<string | null>(null);
const setActiveError = ref('');
const assuming = ref<string | null>(null);
const assumeError = ref('');

// One read for the whole table: RLS shows a player only the flags on their own characters.
const { data: pendingReviews } = useCampaignPendingContentReviews();
const waitingIds = computed(() => new Set((pendingReviews.value ?? []).map((r) => r.party_member_id)));
function isWaiting(char: PartyMember): boolean {
  return waitingIds.value.has(char.id);
}

function isActive(char: PartyMember): boolean {
  return char.id === auth.linkedPartyMemberId;
}

function charSummary(char: PartyMember, species: string | null): string {
  const parts: string[] = [];
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
    // The database refuses a benched character even if the button was reachable.
    setActiveError.value = isApprovalWait(e)
      ? "This character is waiting for your DM's approval."
      : e instanceof Error ? e.message : 'Failed to switch character.';
  } finally {
    settingActive.value = null;
  }
}

async function assume(char: PartyMember) {
  const ok = await confirm(
    `You'll play ${char.name} from now on. You get your own copy, so the DM's original stays as it is. `
      + 'Your current character stays on this page, and you can switch back any time.',
    { title: `Play ${char.name}?`, confirmLabel: 'Play this character', danger: false },
  );
  if (!ok) return;
  assuming.value = char.id;
  assumeError.value = '';
  try {
    await assumeChar(char.id);
    toast.success(`You're now playing ${char.name}.`);
  } catch (e) {
    assumeError.value = toast.fromError(e, "Couldn't take on this character.");
  } finally {
    assuming.value = null;
  }
}

// #730 — a character is the player's, not the campaign's. Leaving detaches it
// back to the pool (progression intact); cloning copies it there for another
// table. Both land on the pool page, which is where the result is visible.
const router = useRouter();
const toast = useToast();
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

function menuItems(char: PartyMember): OverflowMenuEntry[] {
  return [
    { key: 'clone', label: cloning.value === char.id ? 'Copying…' : 'Copy to my pool', disabled: cloning.value === char.id },
    { key: 'leave', label: detaching.value === char.id ? 'Leaving…' : 'Leave campaign', danger: true, disabled: detaching.value === char.id },
  ];
}

function onMenu(key: string, char: PartyMember) {
  if (key === 'clone') void cloneChar(char);
  else if (key === 'leave') void detach(char);
}

async function cloneChar(char: PartyMember) {
  cloning.value = char.id;
  setActiveError.value = '';
  try {
    await cloneCharMut(char.id);
    toast.success(`A copy of ${char.name} is in your pool at Adventurer's Rest.`);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't copy the character."));
  } finally {
    cloning.value = null;
  }
}
</script>
