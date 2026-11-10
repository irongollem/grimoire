<template>
  <!-- The songs page: the table's music on a player's phone, made for a player who cannot read yet. One page per
       shared playlist, swiped to sideways; its songs scroll up and down as big picture buttons, two to a row. Nothing
       a song depends on is written, and the page pins to the home screen as its own app. -->
  <main class="songs-page mx-auto flex h-dvh w-full max-w-xl flex-col sm:max-w-5xl pt-[max(1rem,env(safe-area-inset-top))]">
    <!-- Grimoire's own songs page, not a generic player: the lockup and the word, small, out of the way. -->
    <header class="flex shrink-0 items-center justify-center gap-3 px-4 pb-3 pt-1">
      <BrandLogo class="h-7 w-auto" />
      <span class="text-label-lg font-semibold uppercase text-[#efd9a0]">Songs</span>
    </header>

    <!-- New terms are waiting. The gate itself lives in the app's layouts; mounting it here as well split it into a
         start-up file of its own for every DM and player (the codeRequests budget), so this page sends them there. -->
    <div v-if="termsWaiting" class="m-auto flex max-w-xs flex-col items-center gap-4 px-4 text-center text-white/80">
      <IconMusic class="h-24 w-24 text-white/40" aria-hidden="true" />
      <p class="text-body text-pretty">Grimoire's terms have changed. Open Grimoire to read them, then come back for the songs.</p>
      <!-- A full page load, not a route change: it puts the app's own manifest back (index.html). -->
      <AppButton variant="outline" size="lg" href="/">Open Grimoire</AppButton>
    </div>

    <div v-else-if="isPending" class="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-7 xl:grid-cols-4 px-4 pt-2" aria-busy="true" aria-label="Loading songs">
      <div v-for="n in 4" :key="n" class="aspect-square animate-pulse rounded-[1.75rem] bg-white/10 motion-reduce:animate-none" />
    </div>

    <div v-else-if="isError" class="m-auto flex flex-col items-center gap-4 px-4 text-center text-white/80">
      <IconMusic class="h-20 w-20 text-white/40" aria-hidden="true" />
      <p class="text-body">The songs did not load.</p>
      <AppButton variant="outline" size="lg" @click="refetch()">Try again</AppButton>
    </div>

    <div v-else-if="shelves.length === 0" class="m-auto flex max-w-xs flex-col items-center gap-4 px-4 text-center text-white/80">
      <IconMusic class="h-24 w-24 text-white/40" aria-hidden="true" />
      <p class="text-body text-pretty">
        No songs yet. Your DM can share a music playlist by ticking <strong>Players can listen</strong> in it.
      </p>
    </div>

    <template v-else>
      <!-- Sideways: one playlist per page, snapping, by the browser's own scrolling so a swipe feels native.
           Up and down: that playlist's songs, each page scrolling on its own. -->
      <div
        ref="pager"
        class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        @scroll.passive="onPagerScroll"
      >
        <section
          v-for="shelf in shelves"
          :key="shelf.playlistId"
          class="h-full w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-y-contain px-4 pb-6"
          :aria-label="shelf.playlistName"
        >
          <!-- For a grown-up: which playlist this is. The child finds it by its picture in the bar below. -->
          <h2 class="truncate pb-3 text-center text-label text-white/60">
            <template v-if="manyCampaigns">{{ shelf.campaignName }} · </template>{{ shelf.playlistName }}
          </h2>
          <div class="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-7 xl:grid-cols-4">
            <SongTile
              v-for="song in shelf.songs"
              :key="song.id"
              :song="song"
              :current="currentId === song.id"
              :playing="currentId === song.id && playing"
              :progress="currentId === song.id ? progress : 0"
              :failed="failedId === song.id"
              @tap="tap(song)"
            />
          </div>
        </section>
      </div>

      <!-- Which playlist: each one's first song as a small round picture, the current one ringed. A tap goes there.
           Raw buttons, like the song pads: the picture is the whole control. Centred by auto margins on the first and
           last, not justify-center, which pushes the first ones past the scrollable edge once the row overflows. -->
      <nav
        v-if="shelves.length > 1"
        class="flex shrink-0 gap-3 overflow-x-auto border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 [scrollbar-width:none]"
        aria-label="Playlists"
      >
        <button
          v-for="(shelf, i) in shelves"
          :key="shelf.playlistId"
          type="button"
          class="shrink-0 rounded-full transition-transform first:ms-auto last:me-auto duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          :class="i === page ? 'scale-110 ring-[3px] ring-white' : 'opacity-60'"
          :aria-label="shelf.playlistName"
          :aria-current="i === page ? 'page' : undefined"
          @click="goTo(i)"
        >
          <SongCover :song="shelf.songs[0]!" class="relative h-11 w-11 rounded-full" />
        </button>
      </nav>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
import SongCover from "@/components/soundboard/songs/SongCover.vue";
import SongTile from "@/components/soundboard/songs/SongTile.vue";
import { usePlayerSongs } from "@/composables/soundboard/usePlayerSongs";
import { useSongPlayer } from "@/composables/soundboard/useSongPlayer";
import { useTermsGate } from "@/composables/account/useTermsGate";
import { useCampaignLiveSync } from "@/composables/campaign/useCampaignLiveSync";
import { IconMusic } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";

const { visible: termsWaiting } = useTermsGate();
// The public layout mounts no doorbell, so the page joins the active campaign's itself: a DM sharing, changing or
// unsharing a playlist, or a player leaving the table, reaches the open page. Other campaigns refresh on refocus.
useCampaignLiveSync();
const { data, isPending, isError, refetch } = usePlayerSongs();
const shelves = computed(() => data.value ?? []);
const manyCampaigns = computed(() => new Set(shelves.value.map((s) => s.campaignId)).size > 1);

// The page in view, read back from the pager's own scroll position so a swipe and a tap in the bar agree.
const pager = ref<HTMLElement | null>(null);
const page = ref(0);
function onPagerScroll() {
  const el = pager.value;
  if (!el || el.clientWidth === 0) return;
  page.value = Math.min(shelves.value.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
}
function goTo(i: number) {
  const el = pager.value;
  if (!el) return;
  el.scrollTo({ left: i * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
const { currentId, playing, progress, failedId, tap } = useSongPlayer();

</script>
