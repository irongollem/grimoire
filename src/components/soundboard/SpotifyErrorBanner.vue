<template>
  <div
    v-if="spotifyStore.playError"
    class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5"
  >
    <p class="flex-1 text-caption-sm leading-snug text-destructive">
      {{ spotifyStore.playError }}
      <span v-if="hint" class="mt-0.5 block text-muted-foreground">{{ hint }}</span>
    </p>
    <button
      class="shrink-0 text-muted-foreground hover:text-foreground"
      title="Dismiss"
      @click="spotifyStore.playError = null"
    >
      <IconClose class="h-3 w-3" />
    </button>
  </div>
</template>

<script setup lang="ts">
// Shared between the /soundboard page and the floating widget. A Spotify
// failure that is only visible in one of them is a failure the DM will most
// likely never see — see the two-surface rule in the soundboard feature doc.
import { computed } from "vue";
import { IconClose } from "@/lib/icons";
import { useSpotifyStore } from "@/stores/spotify";

const spotifyStore = useSpotifyStore();

/**
 * Turn Spotify's wording into the action that actually resolves it. These are
 * the two failures whose fix lives entirely outside this codebase, so saying
 * only what went wrong leaves the DM with nowhere to go.
 */
const hint = computed<string | null>(() => {
  const err = spotifyStore.playError;
  if (!err) return null;

  if (err.includes("Not allowed")) {
    return "Close the Spotify desktop app and try again.";
  }
  if (err.includes("403") || err.includes("Development mode")) {
    // Ordered by how often each is actually the cause. The API/SDK declaration
    // catches out every app created before Spotify split "Web API" and "Web
    // Playback SDK" into separate checkboxes — those apps declare only Web API
    // and are refused the moment the SDK is used, with no hint as to why.
    return "In the Spotify developer dashboard, check two things on this app: under Basic Information, both Web API and Web Playback SDK must be ticked; and under User Management, the account you sign in with must be listed. Owning the app is not enough on either count.";
  }
  return null;
});
</script>
