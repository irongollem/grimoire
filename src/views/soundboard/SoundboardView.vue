<template>
  <ListPageLayout title="Soundboard" description="Ambient sounds & music for your sessions">
    <template #title-suffix>
      <ManualHelpLink page="soundboard" />
    </template>

    <template #actions>
      <!-- Spotify connect/disconnect (only for the owner user) -->
      <template v-if="spotifyStore.isEnabled">
        <button
          v-if="spotifyStore.isConnected"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            spotifyStore.isReady
              ? 'border-green-500/40 text-green-400 hover:text-green-300 hover:border-green-500/60'
              : 'border-border text-muted-foreground'
          "
          :title="spotifyStore.isReady ? 'Spotify connected — click to disconnect' : 'Connecting to Spotify…'"
          @click="spotifyStore.isReady ? spotifyStore.disconnect() : undefined"
        >
          <IconMusicNote class="h-3.5 w-3.5 shrink-0" />
          {{ spotifyStore.isReady ? "Spotify" : "Connecting…" }}
        </button>
        <button
          v-else
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-cinzel tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          title="Connect your Spotify account"
          @click="spotifyStore.connect()"
        >
          <IconMusicNote class="h-3.5 w-3.5 shrink-0" />
          Connect Spotify
        </button>
      </template>

      <!-- Spotify is per-campaign BYOK. Without a Client ID the whole control
           vanished, so a DM on a campaign that has not been configured saw no
           trace of the feature and no way to find it. Point at the setting. -->
      <RouterLink
        v-else-if="auth.isDM"
        :to="{ name: 'campaign-settings', query: { tab: 'spotify' } }"
        class="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 font-cinzel text-xs tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        title="Spotify needs a Client ID on this campaign before it can be connected"
      >
        <IconMusicNote class="h-3.5 w-3.5 shrink-0" />
        Set up Spotify
      </RouterLink>

      <SoundboardWidgetToggle />
      <ListActionButton
        v-if="ui.soundboardViewMode === 'sounds'"
        :icon="IconAdd"
        :label="soundQuota?.unlimited === false ? `Add Sound (${soundQuota.current}/${soundQuota.limit})` : 'Add Sound'"
        variant="primary"
        @click="openAddSound()"
      />
    </template>

    <template #filters>
      <ListFilterBar
        v-if="ui.soundboardViewMode === 'sounds'"
        :has-active-filters="ui.soundboardHasActiveFilters"
        @clear="ui.resetSoundboardFilters()"
      >
        <ListSearchInput v-model="ui.soundboardSearchQuery" placeholder="Search sounds…" />
        <SoundCategoryFilter v-model="ui.soundboardFilterCategory" />
      </ListFilterBar>
    </template>

    <!-- Page tabs (always visible so the DM can create the first page) -->
    <!-- Above the tabs on purpose: "what is audible and why" is the first
         question a DM has when they open this page, and answering it by
         scanning the grid for lit cards is the delay the feature exists to
         remove. -->
    <NowRail class="-mx-3 rounded-none sm:mx-0 sm:rounded-lg sm:border sm:border-border" />

    <SoundboardPageTabs
      v-model="ui.soundboardActivePage"
      :pages="pages ?? []"
    />

    <!-- Sounds / Scenes / Playlists — three peers. A scene is a room and a
         playlist is a running order; filing both under "Playlists" meant a DM
         hunting for the tavern had to read past their combat music. -->
    <div class="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border/50 w-fit my-3">
      <button
        v-for="mode in VIEW_MODES"
        :key="mode.id"
        class="flex items-center gap-1.5 px-3 py-1 rounded-md font-cinzel text-xs tracking-wide transition-colors"
        :class="ui.soundboardViewMode === mode.id
          ? 'bg-card shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'"
        @click="ui.soundboardViewMode = mode.id"
      >
        <component :is="mode.icon" class="h-3.5 w-3.5" />
        {{ mode.label }}
      </button>
    </div>

    <!-- Spotify errors surface here too, not just in the widget: a connection
         failure the DM never sees is a connection failure they cannot fix. -->
    <SpotifyErrorBanner />

    <!-- Mixer — the same component the floating widget uses, so the two
         soundboard surfaces can never drift apart. -->
    <div class="rounded-lg border border-border bg-card px-3 py-2">
      <SoundboardMixer />
    </div>

    <!-- One panel, filtered by type — scenes and playlists are the same table
         and the same card; only the question being asked differs. -->
    <PlaylistsPanel
      v-if="ui.soundboardViewMode !== 'sounds'"
      :page-id="ui.soundboardActivePage"
      :playlist-type="ui.soundboardViewMode === 'scenes' ? 'ambient' : 'music'"
    />

    <template v-else>

    <AddSoundDialog
      :open="showForm"
      :page-id="newSoundPageId"
      :gemini-api-key="geminiApiKey"
      :campaign-id="activeCampaignId ?? null"
      @close="showForm = false"
    />

    <PaywallModal v-model="showSoundPaywall" resource="sounds" />

    <!-- Loading -->
    <LoadingSpinner v-if="isPending" />

    <!-- Empty state. The starter scenes lead rather than the Add button: a DM
         on day one has nothing to add yet, and "build your own library" is the
         work this feature is supposed to remove. -->
    <div v-else-if="filtered.length === 0 && !ui.soundboardHasActiveFilters" class="space-y-4">
      <StarterScenesCard />
      <EmptyState
        icon="music"
        title="No sounds yet"
        description="Add ambient tracks, music, and effects for your sessions."
        action-label="Add Sound"
        @action="openAddSound()"
      />
    </div>

    <div
      v-else-if="filtered.length === 0"
      class="py-10 text-center text-body text-muted-foreground italic"
    >
      No sounds match your filters.
    </div>

    <!-- Sound grid -->
    <template v-else>
      <!-- Drag hint when filters are active -->
      <p
        v-if="ui.soundboardHasActiveFilters"
        class="mb-2 text-caption text-muted-foreground italic"
      >
        Clear filters to reorder cards.
      </p>

      <VueDraggable
        v-model="orderedSounds"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        :disabled="ui.soundboardHasActiveFilters"
        handle=".drag-handle"
        :animation="150"
        ghost-class="opacity-40"
        @end="persistOrder"
      >
        <div v-for="(sound, index) in orderedSounds" :key="sound.id" class="group relative">
          <!-- Drag handle — only visible when not filtered -->
          <div
            v-if="!ui.soundboardHasActiveFilters"
            class="drag-handle absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
            title="Drag to reorder"
          >
            <IconDrag class="h-3.5 w-3.5" />
          </div>
          <!-- The number key that fires this card. Shown rather than documented,
               because a shortcut nobody can see is a shortcut nobody uses. -->
          <KeyCap
            v-if="index < 9"
            class="absolute top-2 right-2 z-10"
            :title="`Press ${index + 1} to fire this sound`"
          >
            {{ index + 1 }}
          </KeyCap>
          <SoundCard
            :sound="sound"
            :show-delete="true"
            :pages="pages ?? []"
            @delete="handleDelete"
          />
        </div>
      </VueDraggable>
    </template>

    </template> <!-- end v-else sounds view -->
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { IconAdd, IconDrag, IconMusicNote, IconList, IconListOrdered, IconWind } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import { useSounds, useDeleteSound, useReorderSounds, useBulkAssignToPage } from "@/composables/useSounds";
import { useSoundboardPages, useCreateSoundboardPage } from "@/composables/useSoundboardPages";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useQuota } from "@/composables/useQuota";
import { useSoundboardHotkeys } from "@/composables/useSoundboardHotkeys";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import type { Sound } from "@/types/sound.types";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import SoundCard from "@/components/soundboard/SoundCard.vue";
import StarterScenesCard from "@/components/soundboard/StarterScenesCard.vue";
import NowRail from "@/components/soundboard/NowRail.vue";
import KeyCap from "@/components/soundboard/KeyCap.vue";
import AddSoundDialog from "@/components/soundboard/AddSoundDialog.vue";
import SoundCategoryFilter from "@/components/soundboard/SoundCategoryFilter.vue";
import SoundboardWidgetToggle from "@/components/soundboard/SoundboardWidgetToggle.vue";
import SoundboardPageTabs from "@/components/soundboard/SoundboardPageTabs.vue";
import PlaylistsPanel from "@/components/soundboard/PlaylistsPanel.vue";

const VIEW_MODES = [
  { id: "sounds", label: "Sounds", icon: IconList },
  { id: "scenes", label: "Scenes", icon: IconWind },
  { id: "playlists", label: "Playlists", icon: IconListOrdered },
] as const;
import SoundboardMixer from "@/components/soundboard/SoundboardMixer.vue";
import SpotifyErrorBanner from "@/components/soundboard/SpotifyErrorBanner.vue";

const ui = useUiStore();
const soundboardStore = useSoundboardStore();
const spotifyStore = useSpotifyStore();
const auth = useAuthStore();
const { canCreate: canCreateSound, quota: soundQuota } = useQuota("sounds");
const showSoundPaywall = ref(false);
const campaignStore = useCampaignStore();
const { activeCampaignId } = storeToRefs(campaignStore);
const geminiApiKey = computed(() => campaignStore.decryptedGeminiKey || null);

onMounted(() => spotifyStore.initSDK());

const { data: sounds, isPending, isSuccess: soundsReady } = useSounds();
const { data: pages, isSuccess: pagesReady } = useSoundboardPages();
const { mutateAsync: deleteSound } = useDeleteSound();
const { mutate: reorderSounds } = useReorderSounds();
const { mutateAsync: createDefaultPage } = useCreateSoundboardPage();
const { mutateAsync: bulkAssign } = useBulkAssignToPage();

// Auto-init: on first load with no pages, create "Main" and assign all existing sounds to it.
const autoInitDone = ref(false);
watch(
  [pagesReady, soundsReady, pages],
  ([pr, sr, p]) => {
    if (!pr || !sr || autoInitDone.value || !activeCampaignId.value) return;
    if ((p ?? []).length === 0) {
      autoInitDone.value = true;
      createDefaultPage({ name: "Main", sort_order: 0 }).then((newPage) => {
        ui.soundboardActivePage = newPage.id;
        return bulkAssign({ pageId: newPage.id, campaignId: activeCampaignId.value! });
      });
    }
  },
);

const showForm = ref(false);

function openAddSound() {
  if (!canCreateSound.value) { showSoundPaywall.value = true; return; }
  showForm.value = true;
}

// Page to assign new sounds to:
// - specific page active → use it
// - "All" with exactly 1 page → auto-assign to that page
// - "All" with multiple pages → unassigned (null)
const newSoundPageId = computed(() => {
  if (ui.soundboardActivePage !== null) return ui.soundboardActivePage;
  if ((pages.value?.length ?? 0) === 1) return pages.value![0].id;
  return null;
});

// ── Filtering ─────────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = sounds.value ?? [];

  // Filter by active page (null = "All", shows everything)
  if (ui.soundboardActivePage !== null) {
    list = list.filter((s) => s.page_id === ui.soundboardActivePage);
  }

  if (ui.soundboardFilterCategory !== "all") {
    list = list.filter((s) => s.category === ui.soundboardFilterCategory);
  }

  const q = ui.soundboardSearchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }

  return list;
});

// ── Drag-drop ordering ────────────────────────────────────────────────────

const orderedSounds = ref<Sound[]>([]);

watch(
  filtered,
  (newList) => {
    orderedSounds.value = [...newList];
  },
  { immediate: true },
);

// Number keys fire the cards in the order they are rendered, so the mapping
// always matches the badges the DM can see.
useSoundboardHotkeys(orderedSounds);

function persistOrder() {
  const updates = orderedSounds.value
    .map((s, index) => ({ id: s.id, sort_order: index }))
    .filter(({ id, sort_order }) => {
      const original = (sounds.value ?? []).find((s) => s.id === id);
      return original === undefined || original.sort_order !== sort_order;
    });
  reorderSounds(updates);
}

// ── Delete ────────────────────────────────────────────────────────────────

async function handleDelete(sound: Sound) {
  await deleteSound(sound);
  soundboardStore.releaseSound(sound.id);
}
</script>
