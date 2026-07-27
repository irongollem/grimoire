<template>
  <Teleport to="body">
    <Transition name="palette-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-start justify-center p-4 pt-[12vh]"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Fire a sound"
        >
          <!-- Query -->
          <div class="flex items-center gap-2 border-b border-border px-4 py-3">
            <IconSearch class="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="Fire a sound or scene…"
              class="min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <span class="shrink-0 text-caption-sm text-muted-foreground/60">
              {{ rows.length }}
            </span>
          </div>

          <!-- Results -->
          <div ref="listRef" class="max-h-[50vh] overflow-y-auto">
            <p v-if="isPending" class="px-4 py-6 text-center text-caption text-muted-foreground">
              Loading the board…
            </p>

            <p
              v-else-if="rows.length === 0"
              class="px-4 py-6 text-center text-caption text-muted-foreground"
            >
              {{ query.trim() === "" ? "This campaign has no sounds yet." : `Nothing matches “${query.trim()}”.` }}
            </p>

            <template v-else>
              <template v-for="(row, index) in rows" :key="row.key">
                <div
                  v-if="index === 0 || rows[index - 1].kind !== row.kind"
                  class="border-b border-border/50 bg-secondary/30 px-4 py-1.5 font-cinzel text-2xs uppercase tracking-widest text-muted-foreground/60"
                >
                  {{ row.kind === "playlist" ? "Playlists & scenes" : "Sounds" }}
                </div>

                <SoundPaletteRow
                  :data-row="index"
                  :name="row.name"
                  :chip="row.chip"
                  :hint="row.hint"
                  :icon="row.icon"
                  :active="row.active"
                  :focused="index === focusedIndex"
                  :action-label="row.actionLabel"
                  :blocked-reason="row.blockedReason"
                  @focus="focusedIndex = index"
                  @fire="fireRow(row)"
                />
              </template>
            </template>
          </div>

          <!-- Key hints. A palette whose keys you have to guess is a slower
               mouse target, not a faster keyboard one. -->
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-caption-sm text-muted-foreground/70"
          >
            <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> move</span>
            <span><kbd class="kbd">⏎</kbd> fire</span>
            <span><kbd class="kbd">Esc</kbd> close</span>
            <span class="ml-auto">Stays open — fire several in a row</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// Fire-by-search, from any page.
//
// The soundboard's own claim is "buttons you can hit without looking away from
// the table", and until now every one of them was a mouse target on a grid that
// scrolls. This is the keyboard route to the same sounds: type three letters,
// hit Enter. It deliberately stays open after firing, because the thing you
// actually do mid-session is fire two or three cues in a row.
import { computed, nextTick, ref, watch, type Component } from "vue";
import { IconSearch, IconMusicNote, IconWind, IconLightning, IconMusic, IconListOrdered } from "@/lib/icons";
import SoundPaletteRow from "./SoundPaletteRow.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists, useFetchPlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { useAudibleCheck, useBlockedCheck, useActionCheck, useSoundTrigger, ACTION_LABEL } from "@/composables/useSoundPlayback";
import { useHotkeys } from "@/composables/useHotkeys";
import { rankEntries } from "@/lib/soundSearch";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const store = useSoundboardStore();
const { data: sounds, isPending: soundsPending } = useSounds();
const { data: playlists, isPending: playlistsPending } = usePlaylists();
const fetchTracks = useFetchPlaylistTracks();

const isAudible = useAudibleCheck();
const blockedReason = useBlockedCheck();
const nextAction = useActionCheck();
const trigger = useSoundTrigger();

const query = ref("");
const focusedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const isPending = computed(() => soundsPending.value || playlistsPending.value);

// `undefined` here means "still loading", which the pending state above already
// renders — an empty list is the right thing to rank against in the meantime.
const allSounds = computed<Sound[]>(() => sounds.value === undefined ? [] : sounds.value);
const allPlaylists = computed<SoundboardPlaylist[]>(() => playlists.value === undefined ? [] : playlists.value);

const SOUND_ICONS: Record<string, Component> = {
  music: IconMusicNote,
  ambient: IconWind,
  effects: IconLightning,
};

interface PaletteRow {
  key: string;
  kind: "playlist" | "sound";
  name: string;
  chip: string;
  hint: string | null;
  icon: Component;
  active: boolean;
  actionLabel: string;
  blockedReason: string | null;
  sound: Sound | null;
  playlist: SoundboardPlaylist | null;
}

/**
 * Playlists rank above loose sounds. A DM typing "tavern" mid-session almost
 * always wants the tavern scene rather than one clatter from inside it, and the
 * list is short enough that the sounds are still one keypress away.
 */
const playlistRows = computed<PaletteRow[]>(() =>
  rankEntries(query.value, allPlaylists.value, (p) => ({ name: p.name }), 8).map((playlist) => {
    const active = store.isPlaylistActive(playlist.id);
    return {
      key: `playlist:${playlist.id}`,
      kind: "playlist",
      name: playlist.name,
      chip: playlist.playlist_type === "music" ? "music" : "scene",
      hint: null,
      icon: playlist.playlist_type === "music" ? IconListOrdered : IconWind,
      active,
      actionLabel: active ? "Stop" : "Start",
      blockedReason: null,
      sound: null,
      playlist,
    };
  }),
);

const soundRows = computed<PaletteRow[]>(() =>
  rankEntries(
    query.value,
    allSounds.value,
    (s) => ({ name: s.name, tags: s.tags, secondary: s.artist }),
    40,
  ).map((sound) => ({
    key: `sound:${sound.id}`,
    kind: "sound" as const,
    name: sound.name,
    chip: sound.category,
    hint: sound.artist,
    icon: SOUND_ICONS[sound.category] ?? IconMusic,
    active: isAudible(sound),
    actionLabel: ACTION_LABEL[nextAction(sound)],
    blockedReason: blockedReason(sound),
    sound,
    playlist: null,
  })),
);

const rows = computed<PaletteRow[]>(() => [...playlistRows.value, ...soundRows.value]);

function move(delta: number): void {
  const len = rows.value.length;
  if (len === 0) return;
  focusedIndex.value = (focusedIndex.value + delta + len) % len;
  void nextTick(scrollFocusedIntoView);
}

function scrollFocusedIntoView(): void {
  const el = listRef.value?.querySelector(`[data-row="${focusedIndex.value}"]`);
  if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
}

async function fireRow(row: PaletteRow): Promise<void> {
  if (row.sound) {
    trigger(row.sound);
    return;
  }
  const playlist = row.playlist;
  if (!playlist) return;

  if (store.isPlaylistActive(playlist.id)) {
    // Scoped by id: stopping one scene from the palette must not take down the
    // others stacked with it.
    store.stopPlaylist(playlist.playlist_type, playlist.id);
    return;
  }
  const tracks = await fetchTracks(playlist.id);
  if (tracks.length > 0) store.playPlaylist(playlist, tracks);
}

function fireFocused(): void {
  const row = rows.value[focusedIndex.value];
  if (row) void fireRow(row);
}

// Overlay layer: while this is open, nothing on the page behind it responds to
// a keypress — 1-9 must not fire board sounds through the palette.
useHotkeys(
  [
    { combo: "arrowdown", description: "Next result", handler: () => move(1), allowInTextEntry: true, hidden: true },
    { combo: "arrowup", description: "Previous result", handler: () => move(-1), allowInTextEntry: true, hidden: true },
    { combo: "enter", description: "Fire the focused result", handler: fireFocused, allowInTextEntry: true, hidden: true },
    { combo: "escape", description: "Close the palette", handler: () => emit("close"), allowInTextEntry: true, hidden: true },
  ],
  { layer: "overlay", enabled: () => open },
);

// Reset to the top whenever the result set changes, so Enter never fires
// whatever happened to be at the old index.
watch(rows, () => { focusedIndex.value = 0; });

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    query.value = "";
    focusedIndex.value = 0;
    void nextTick(() => inputRef.value?.focus());
  },
);
</script>

<style scoped>
.kbd {
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  padding: 0 0.25rem;
  margin-right: 0.125rem;
  font-size: 0.625rem;
}

.palette-fade-enter-active,
.palette-fade-leave-active {
  transition: opacity 0.12s ease;
}
.palette-fade-enter-active .relative,
.palette-fade-leave-active .relative {
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.palette-fade-enter-from,
.palette-fade-leave-to {
  opacity: 0;
}
.palette-fade-enter-from .relative,
.palette-fade-leave-to .relative {
  transform: translateY(-0.5rem);
  opacity: 0;
}
</style>
