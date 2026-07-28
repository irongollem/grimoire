<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-settings-title"
        >
          <div class="flex items-center gap-3 border-b border-border px-5 pt-5 pb-4">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
              <IconSettings class="h-4.5 w-4.5" />
            </div>
            <h2 id="board-settings-title" class="font-cinzel text-sm font-bold tracking-wide text-foreground">
              Board settings
            </h2>
            <button
              type="button"
              class="ml-auto rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              @click="emit('close')"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <!--
            Both of these were checkboxes wedged in among the mixer's faders.
            They are settings, not levels, and each one needs its reasoning
            beside it: a DM who does not know the rule cannot tell whether the
            feature is broken or working exactly as intended.
          -->
          <div class="space-y-5 px-5 py-4">
            <!-- A preference, not performance chrome: three size buttons parked
                 beside the mode control competed with it on every visit for a
                 decision made about once per campaign. -->
            <section class="space-y-1.5">
              <span class="block font-cinzel text-body-sm text-foreground">Pad size in Perform</span>
              <div class="flex gap-1 rounded-lg border border-border/50 bg-muted/40 p-1 w-fit">
                <button
                  v-for="pad in PAD_SIZES"
                  :key="pad.id"
                  type="button"
                  class="rounded-md px-2.5 py-1 font-cinzel text-xs tracking-wide transition-colors"
                  :class="ui.soundboardPadSize === pad.id
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'"
                  @click="ui.soundboardPadSize = pad.id"
                >
                  {{ pad.label }}
                </button>
              </div>
              <p class="text-caption text-muted-foreground">
                {{ PAD_SIZES.find((p) => p.id === ui.soundboardPadSize)?.hint }}
              </p>
            </section>

            <label class="flex cursor-pointer select-none items-start gap-2.5">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
                :checked="audioTriggersEnabled"
                @change="setAudioTriggersEnabled(($event.target as HTMLInputElement).checked)"
              />
              <span>
                <span class="block font-cinzel text-body-sm text-foreground">
                  Let encounters and locations pick audio
                </span>
                <span class="mt-0.5 block text-caption text-muted-foreground">
                  Give an encounter or a location a theme, label a playlist to match, and the audio
                  follows the game. A request that matches nothing does nothing at all — it never
                  stops or replaces what you already have running.
                </span>
              </span>
            </label>

            <div class="space-y-1.5">
              <label class="flex cursor-pointer select-none items-start gap-2.5">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
                  :checked="broadcasting"
                  @change="setBroadcasting(($event.target as HTMLInputElement).checked)"
                />
                <span>
                  <span class="block font-cinzel text-body-sm text-foreground">
                    Share music with remote players
                  </span>
                  <span class="mt-0.5 block text-caption text-muted-foreground">
                    Music only, and only for this session — it switches itself off again next time.
                    Each player still presses Join on their own device, because a browser will not
                    start audio without them and nobody's speakers should come alive on someone
                    else's click. For remote tables: several devices in one room playing the same
                    track sound worse than one.
                  </span>
                </span>
              </label>
              <p v-if="broadcastError" class="pl-6.5 text-caption text-destructive">
                {{ broadcastError }}
              </p>
            </div>
          </div>

          <div class="flex justify-end border-t border-border px-5 py-3">
            <button
              type="button"
              class="rounded-md border border-border px-3 py-1.5 font-cinzel text-xs tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              @click="emit('close')"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { IconClose, IconSettings } from "@/lib/icons";
import { useHotkeys } from "@/composables/useHotkeys";
import { useAudioTriggerPrefs } from "@/composables/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/useSoundboardBroadcast";
import { useUiStore } from "@/stores/ui";

const PAD_SIZES = [
  { id: "sm", label: "Small", hint: "Name and colour only — fits the most on screen." },
  { id: "md", label: "Medium", hint: "Name, length and loop mark." },
  { id: "lg", label: "Large", hint: "Adds the artist." },
] as const;

/**
 * The two switches that used to sit in the mixer wearing faders' clothes.
 *
 * The mixer keeps a read-only echo of their state, because it is still where a
 * DM looks when the audio surprised them — it just stops being the place you
 * change them.
 */

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const ui = useUiStore();
const { audioTriggersEnabled, setAudioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError, setBroadcasting } = useSoundboardBroadcast();

// Overlay layer: Escape closes, and the page's transport keys stop responding
// while this is open.
useHotkeys(
  [{ combo: "escape", description: "Close", handler: () => emit("close"), hidden: true }],
  { layer: "overlay", enabled: () => open },
);
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
