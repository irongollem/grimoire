// Soundboard filters, view mode, pad size, mixer, Add Sound dialog, settings, starter-scene offer.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import type { BoardMode, PadSize, SoundCategory } from "@/types/sound.types";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAppUiStore } from "@/stores/ui/app";

export const useSoundboardUiStore = defineStore("ui:soundboard", () => {
  // `soundboardBoardMode` is derived from the global prep/play switch, which
  // lives in the app store.
  const app = useAppUiStore();

  // Soundboard UI state
  const soundboardFilterCategory = ref<SoundCategory | "all">("all");
  const soundboardSearchQuery = ref("");
  // null = "All" virtual tab; string = specific page ID
  const soundboardActivePage = ref<string | null>(null);
  const soundboardHasActiveFilters = computed(
    () => soundboardFilterCategory.value !== "all" || soundboardSearchQuery.value !== "",
  );

  function resetSoundboardFilters() {
    soundboardFilterCategory.value = "all";
    soundboardSearchQuery.value = "";
  }

  // Three peers, not two. Scenes and music playlists are the same table but
  // answer different questions — a scene is a room, a playlist is a running
  // order — and mixing them in one list meant neither read as a category.
  const soundboardViewMode = ref<"sounds" | "scenes" | "playlists">("sounds");

  const soundboardPadSize = useStorage<PadSize>("grimoire_soundboard_pad_size", "md", safeLocalStorage());

  // The mixer drawer — same pattern as the campaign chat: in-flow, pushes the
  // board left while open. Session-scoped like chatOpen, not persisted.
  const soundboardMixerOpen = ref(false);

  // The Add Sound dialog, mounted app-wide in AiGeneratorPanels like every
  // generator panel, because music generation runs in the background and the
  // badge's "Reopen" has to bring the dialog back from whatever page the DM
  // is on. The page is chosen when it opens (SoundboardView's openAddSound)
  // and kept, so a reopened retry still lands on the board it started from.
  const addSoundDialogOpen = ref(false);
  const addSoundPageId = ref<string | null>(null);

  // Board settings. Lives here rather than inside the mixer because the mixer is
  // only mounted while its drawer is open, and the dialog now has an entry point
  // in the page header too — the mixer's status row used to be the only way in,
  // a muted line its own comment called "a read-only echo, not a control".
  const soundboardSettingsOpen = ref(false);

  // Bumped by the mobile bottom-nav FAB. The soundboard view watches it and
  // opens whichever create fits the tab that is showing — adding a sound is a
  // dialog, not a route, so the FAB cannot simply navigate.
  const soundboardCreateSignal = ref(0);

  /**
   * Perform = fire targets only, for running a session. Arrange = the same pads
   * with their full control strip, for setting one up.
   *
   * Derived from `dmMode` rather than owning its own switch. It used to be a
   * persisted ref behind an Arrange/Perform control in the soundboard header,
   * which was the same prep-vs-play distinction the app already makes globally,
   * asked a second time on one page — and the two could disagree, so a DM in play
   * could be looking at a board still dressed for setup.
   *
   * The escape hatch is the global toggle: to rearrange mid-session, drop into
   * prep and back. That is one control instead of two, and it cannot drift.
   */
  const soundboardBoardMode = computed<BoardMode>(() =>
    app.dmMode === "play" ? "perform" : "arrange",
  );

  // Soundboard starter-scene offer (StarterScenesCard). A DM who has decided
  // against the ready-made scenes should not be offered them on every visit.
  // Per campaign: the scenes are added to one campaign, so declining them in
  // one says nothing about the next.
  const dismissedStarterSceneOffers = useStorage<Record<string, boolean>>(
    "grimoire:starter-scenes-dismissed",
    {},
    safeLocalStorage(),
  );

  function isStarterSceneOfferDismissed(campaignId: string): boolean {
    return dismissedStarterSceneOffers.value[campaignId] === true;
  }

  function dismissStarterSceneOffer(campaignId: string) {
    dismissedStarterSceneOffers.value = { ...dismissedStarterSceneOffers.value, [campaignId]: true };
  }

  return {
    isStarterSceneOfferDismissed,
    dismissStarterSceneOffer,
    soundboardFilterCategory,
    soundboardSearchQuery,
    soundboardActivePage,
    soundboardHasActiveFilters,
    resetSoundboardFilters,
    soundboardViewMode,
    soundboardBoardMode,
    soundboardPadSize,
    soundboardMixerOpen,
    addSoundDialogOpen,
    addSoundPageId,
    soundboardSettingsOpen,
    soundboardCreateSignal,
  };
});
