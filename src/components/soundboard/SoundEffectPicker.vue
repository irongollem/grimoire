<template>
  <div class="relative">
    <!-- Trigger button — wand icon, lights up gold when an effect is active -->
    <button
      type="button"
      class="p-1.5 rounded-md border transition-colors"
      :class="currentPreset !== 'none'
        ? 'border-gold-500/40 text-gold-400 bg-gold-500/10'
        : 'border-border text-muted-foreground hover:text-foreground'"
      :title="currentPreset !== 'none' ? `Effect: ${currentLabel} — click to change` : 'Add audio effect'"
      @click="toggle"
    >
      <IconWand class="h-3 w-3" />
    </button>

    <!-- Effect picker panel — floats above the button -->
    <Transition
      enter-active-class="transition-all duration-100 ease-out"
      leave-active-class="transition-all duration-75 ease-in"
      enter-from-class="opacity-0 scale-95"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute bottom-full right-0 mb-1.5 flex gap-1 bg-card border border-border rounded-lg p-1.5 shadow-xl z-50 origin-bottom-right"
      >
        <button
          v-for="opt in OPTIONS"
          :key="opt.value"
          type="button"
          class="px-2 py-1 rounded-md font-cinzel text-[10px] tracking-wide transition-colors whitespace-nowrap"
          :class="currentPreset === opt.value
            ? 'bg-gold-500/20 border border-gold-500/40 text-gold-400'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'"
          @click="pick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { IconWand } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import type { AudioEffectPreset } from "@/types/sound.types";

const { soundId, fileUrl } = defineProps<{ soundId: string; fileUrl: string }>();

const store = useSoundboardStore();
const open = ref(false);

const OPTIONS = [
  { value: "none"         as AudioEffectPreset, label: "Off"     },
  { value: "through_door" as AudioEffectPreset, label: "Door"    },
  { value: "through_wall" as AudioEffectPreset, label: "Wall"    },
  { value: "distant"      as AudioEffectPreset, label: "Distant" },
  { value: "underwater"   as AudioEffectPreset, label: "Water"   },
] as const;

const currentPreset = computed<AudioEffectPreset>(
  () => store.soundEffects[soundId] ?? "none",
);

const currentLabel = computed(
  () => OPTIONS.find((o) => o.value === currentPreset.value)?.label ?? "Off",
);

let removeListener: (() => void) | null = null;

function closePicker() {
  open.value = false;
  removeListener?.();
  removeListener = null;
}

function toggle() {
  if (open.value) { closePicker(); return; }

  open.value = true;
  // Defer adding the outside-click listener so the current click doesn't
  // immediately trigger it (the event is still propagating).
  setTimeout(() => {
    const handler = () => closePicker();
    document.addEventListener("click", handler, { once: true });
    removeListener = () => document.removeEventListener("click", handler);
  }, 0);
}

function pick(preset: AudioEffectPreset) {
  store.setEffect(soundId, fileUrl, preset);
  closePicker();
}

// Clean up listener if the component unmounts while the picker is open
onUnmounted(() => { removeListener?.(); });
</script>
