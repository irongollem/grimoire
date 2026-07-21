<template>
  <div>
    <!-- Trigger: wand icon, lights up when an effect is active -->
    <button
      ref="buttonEl"
      type="button"
      class="p-1.5 rounded-md border transition-colors"
      :class="modelValue !== 'none'
        ? 'border-gold-500/40 text-gold-400 bg-gold-500/10'
        : 'border-border text-muted-foreground hover:text-foreground'"
      :title="modelValue !== 'none' ? `Effect: ${currentLabel} — click to change` : 'Add audio effect'"
      @click="toggle"
    >
      <IconWand class="h-3 w-3" />
    </button>

    <!-- Picker panel — teleported to avoid widget overflow clipping -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-100 ease-out"
        leave-active-class="transition-all duration-75 ease-in"
        enter-from-class="opacity-0 scale-95"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          :style="popupStyle"
          class="fixed z-9999 flex gap-1 bg-card border border-border rounded-lg p-1.5 shadow-xl"
          :class="openUpward ? 'origin-bottom-right' : 'origin-top-right'"
        >
          <button
            v-for="opt in OPTIONS"
            :key="opt.value"
            type="button"
            class="px-2 py-1 rounded-md font-cinzel text-2xs tracking-wide transition-colors whitespace-nowrap border"
            :class="modelValue === opt.value
              ? 'bg-gold-500/20 border-gold-500/40 text-gold-400'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'"
            @click.stop="pick(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from "vue";
import { IconWand } from "@/lib/icons";
import type { AudioEffectPreset } from "@/types/sound.types";

const modelValue = defineModel<AudioEffectPreset>({ default: "none" });

const OPTIONS = [
  { value: "none"         as AudioEffectPreset, label: "Off"     },
  { value: "through_door" as AudioEffectPreset, label: "Door"    },
  { value: "through_wall" as AudioEffectPreset, label: "Wall"    },
  { value: "distant"      as AudioEffectPreset, label: "Distant" },
  { value: "underwater"   as AudioEffectPreset, label: "Water"   },
  { value: "cave"         as AudioEffectPreset, label: "Cave"    },
  { value: "sewer"        as AudioEffectPreset, label: "Sewer"   },
] as const;

const buttonEl = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const openUpward = ref(true);
const popupStyle = ref<Record<string, string>>({});

const currentLabel = computed(
  () => OPTIONS.find((o) => o.value === modelValue.value)?.label ?? "Off",
);

function updatePosition() {
  const el = buttonEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const panelW = 300; // approximate panel width
  const panelH = 40;  // approximate panel height
  const spaceBelow = window.innerHeight - rect.bottom;
  openUpward.value = spaceBelow < panelH + 8 && rect.top > spaceBelow;

  if (openUpward.value) {
    popupStyle.value = {
      bottom: `${window.innerHeight - rect.top + 4}px`,
      right:  `${window.innerWidth - rect.right}px`,
    };
  } else {
    popupStyle.value = {
      top:   `${rect.bottom + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  }
  // Clamp left edge so it doesn't run off-screen
  const leftCandidate = rect.right - panelW;
  if (leftCandidate < 8) {
    popupStyle.value.right = "auto";
    popupStyle.value.left  = "8px";
  }
}

let removeListener: (() => void) | null = null;

function closePicker() {
  open.value = false;
  removeListener?.();
  removeListener = null;
}

function toggle() {
  if (open.value) { closePicker(); return; }
  open.value = true;
  nextTick(updatePosition);
  setTimeout(() => {
    const handler = () => closePicker();
    document.addEventListener("click", handler, { once: true });
    removeListener = () => document.removeEventListener("click", handler);
  }, 0);
}

function pick(preset: AudioEffectPreset) {
  modelValue.value = preset;
  closePicker();
}

onUnmounted(() => { removeListener?.(); });
</script>
